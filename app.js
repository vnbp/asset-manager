// ====================================
// ASSET MANAGER PRO - MAIN JAVASCRIPT
// Version: 3.0 Professional
// ====================================

// Global Variables
let API_URL = '';
let currentUser = {
    name: '',
    email: '',
    department: '',
    location: ''
};
let currentAsset = null;
let scanner = null;
let assetCache = [];
let inventoryStats = {};
let scanHistory = [];

// ====================================
// INITIALIZATION
// ====================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize app
    initializeApp();
    
    // Load saved settings
    loadSettings();
    
    // Initialize QR Scanner
    if (document.getElementById('qr-reader')) {
        initQRScanner();
    }
    
    // Load initial data
    if (API_URL) {
        loadDashboardData();
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Check for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('Service Worker registration failed:', err);
        });
    }
});

// ====================================
// APP INITIALIZATION
// ====================================

function initializeApp() {
    // Check if running on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile');
    }
    
    // Initialize tooltips, if any
    initializeTooltips();
    
    // Set current date/time
    updateDateTime();
    setInterval(updateDateTime, 60000); // Update every minute
}

function setupEventListeners() {
    // Search input debouncing
    const searchInput = document.getElementById('searchAssets');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchAssets(), 300);
        });
    }
    
    // Handle Enter key on manual code input
    const manualCodeInput = document.getElementById('manualCode');
    if (manualCodeInput) {
        manualCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                manualCheckIn();
            }
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', handleResize);
    
    // Handle offline/online events
    window.addEventListener('online', () => {
        showToast('Đã kết nối mạng', 'success');
        syncOfflineData();
    });
    
    window.addEventListener('offline', () => {
        showToast('Mất kết nối mạng. Dữ liệu sẽ được lưu offline.', 'warning');
    });
}

function handleResize() {
    // Adjust layout based on screen size
    const width = window.innerWidth;
    if (width < 768) {
        document.getElementById('sidebar')?.classList.remove('active');
    }
}

function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN');
    const timeStr = now.toLocaleTimeString('vi-VN');
    
    const dateTimeElements = document.querySelectorAll('.current-datetime');
    dateTimeElements.forEach(el => {
        el.textContent = `${dateStr} ${timeStr}`;
    });
}

// ====================================
// SETTINGS MANAGEMENT
// ====================================

function loadSettings() {
    // Load from localStorage
    API_URL = localStorage.getItem('apiUrl') || '';
    
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUserDisplay();
    }
    
    // Load scan history
    const savedHistory = localStorage.getItem('scanHistory');
    if (savedHistory) {
        scanHistory = JSON.parse(savedHistory);
    }
    
    // Update form fields
    document.getElementById('settingsApiUrl').value = API_URL;
    document.getElementById('settingsUserName').value = currentUser.name;
    document.getElementById('settingsUserEmail').value = currentUser.email;
    document.getElementById('settingsUserDept').value = currentUser.department;
    document.getElementById('settingsUserLocation').value = currentUser.location;
}

function saveSettings() {
    // Get values from form
    const apiUrl = document.getElementById('settingsApiUrl').value.trim();
    const userName = document.getElementById('settingsUserName').value.trim();
    const userEmail = document.getElementById('settingsUserEmail').value.trim();
    const userDept = document.getElementById('settingsUserDept').value.trim();
    const userLocation = document.getElementById('settingsUserLocation').value.trim();
    
    // Validation
    if (!apiUrl) {
        showToast('Vui lòng nhập API URL!', 'error');
        return;
    }
    
    if (!userName || !userEmail) {
        showToast('Vui lòng nhập đầy đủ thông tin người dùng!', 'error');
        return;
    }
    
    if (!validateEmail(userEmail)) {
        showToast('Email không hợp lệ!', 'error');
        return;
    }
    
    // Save to localStorage
    API_URL = apiUrl;
    localStorage.setItem('apiUrl', API_URL);
    
    currentUser = {
        name: userName,
        email: userEmail,
        department: userDept,
        location: userLocation
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Update display
    updateUserDisplay();
    
    // Initialize sheets if needed
    initializeGoogleSheets();
    
    showToast('Đã lưu cài đặt thành công!', 'success');
    
    // Reload data
    loadDashboardData();
}

function updateUserDisplay() {
    // Update user info in header
    document.getElementById('userName').textContent = currentUser.name || 'User';
    document.getElementById('userEmail').textContent = currentUser.email || 'user@example.com';
    
    // Update avatar
    const avatar = document.getElementById('userAvatar');
    if (avatar && currentUser.name) {
        avatar.textContent = currentUser.name.charAt(0).toUpperCase();
    }
}

// ====================================
// API COMMUNICATION
// ====================================

async function apiCall(action, data = {}) {
    if (!API_URL) {
        throw new Error('API URL chưa được cấu hình');
    }
    
    // Show loading
    showLoading(true);
    
    try {
        const payload = {
            action: action,
            ...data,
            userName: currentUser.name,
            userEmail: currentUser.email
        };
        
        // Try POST first
        let response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            mode: 'no-cors'
        });
        
        // For no-cors, try GET as fallback
        if (response.type === 'opaque' || !response.ok) {
            const params = new URLSearchParams(payload);
            response = await fetch(`${API_URL}?${params}`, {
                method: 'GET',
                redirect: 'follow'
            });
        }
        
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }
        
        return result;
        
    } catch (error) {
        console.error('API Error:', error);
        
        // Try to work offline if possible
        if (!navigator.onLine) {
            return handleOfflineAction(action, data);
        }
        
        throw error;
    } finally {
        showLoading(false);
    }
}

async function testConnection() {
    try {
        const result = await apiCall('initializeSheets');
        
        if (result.success) {
            showToast('✅ Kết nối thành công! Sheets đã sẵn sàng.', 'success');
            
            // Display columns found
            if (result.dataColumns) {
                console.log('Columns found:', result.dataColumns);
            }
        }
    } catch (error) {
        showToast('❌ Lỗi kết nối: ' + error.message, 'error');
    }
}

async function initializeGoogleSheets() {
    try {
        const result = await apiCall('initializeSheets');
        
        if (result.success) {
            console.log('Google Sheets initialized:', result.message);
        }
    } catch (error) {
        console.error('Failed to initialize sheets:', error);
    }
}

// ====================================
// PAGE NAVIGATION
// ====================================

function switchPage(page, element) {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(p => {
        p.style.display = 'none';
    });
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected page
    const pageElement = document.getElementById(page + '-page');
    if (pageElement) {
        pageElement.style.display = 'block';
    }
    
    // Add active class to clicked nav item
    if (element) {
        element.classList.add('active');
    }
    
    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'scan': 'Quét QR Code',
        'assets': 'Danh sách tài sản',
        'inventory': 'Kiểm kê',
        'qr-print': 'In mã QR',
        'reports': 'Báo cáo',
        'settings': 'Cài đặt'
    };
    
    document.getElementById('pageTitle').textContent = titles[page] || 'Asset Manager';
    
    // Load page-specific data
    switch(page) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'assets':
            loadAssetList();
            break;
        case 'inventory':
            loadInventoryList();
            break;
        case 'reports':
            loadReports();
            break;
        case 'scan':
            updateScanHistory();
            break;
    }
    
    // Close mobile sidebar
    if (window.innerWidth < 768) {
        toggleSidebar();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// ====================================
// DASHBOARD FUNCTIONS
// ====================================

async function loadDashboardData() {
    if (!API_URL) {
        showEmptyState('dashboard');
        return;
    }
    
    try {
        // Get statistics
        const stats = await apiCall('getStats');
        
        if (stats.success) {
            updateDashboardStats(stats.stats);
            updateDashboardCharts(stats.stats);
            updateRecentActivity(stats.stats);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Không thể tải dữ liệu dashboard', 'error');
    }
}

function updateDashboardStats(stats) {
    // Update stat cards
    document.getElementById('totalAssets').textContent = stats.totalAssets || 0;
    document.getElementById('checkedAssets').textContent = stats.checkedCount || 0;
    document.getElementById('pendingAssets').textContent = stats.uncheckedCount || 0;
    
    // Calculate percentages
    const checkedPercent = stats.percentage || 0;
    document.getElementById('checkedPercent').textContent = checkedPercent + '%';
    document.getElementById('pendingPercent').textContent = (100 - checkedPercent) + '%';
    
    // Count locations
    const locationCount = Object.keys(stats.byLocation || {}).length;
    document.getElementById('totalLocations').textContent = locationCount;
    
    // Store in global variable
    inventoryStats = stats;
}

function updateDashboardCharts(stats) {
    // Update inventory progress chart
    const ctx = document.getElementById('inventoryChart');
    if (!ctx) return;
    
    // Destroy existing chart if any
    if (window.inventoryChartInstance) {
        window.inventoryChartInstance.destroy();
    }
    
    window.inventoryChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Đã kiểm kê', 'Chưa kiểm kê'],
            datasets: [{
                data: [stats.checkedCount || 0, stats.uncheckedCount || 0],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                title: {
                    display: true,
                    text: `Tiến độ kiểm kê: ${stats.percentage || 0}%`,
                    font: {
                        size: 16
                    }
                }
            }
        }
    });
}

function updateRecentActivity(stats) {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    // Get recent activities from stats
    let html = '';
    
    if (stats.byUser && Object.keys(stats.byUser).length > 0) {
        html += '<div style="margin-bottom: 20px;">';
        html += '<h4 style="font-size: 14px; font-weight: 600; color: var(--gray); margin-bottom: 12px;">Hoạt động theo người dùng</h4>';
        
        for (const [user, count] of Object.entries(stats.byUser)) {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--light);">
                    <span>${user}</span>
                    <span class="table-badge badge-success">${count} tài sản</span>
                </div>
            `;
        }
        html += '</div>';
    }
    
    if (!html) {
        html = '<div class="empty-state"><p>Chưa có hoạt động kiểm kê</p></div>';
    }
    
    container.innerHTML = html;
}// ====================================
// QR SCANNER FUNCTIONS
// ====================================

function initQRScanner() {
    try {
        scanner = new Html5Qrcode("qr-reader");
    } catch (error) {
        console.error('Failed to initialize QR scanner:', error);
        showToast('Không thể khởi tạo máy quét QR', 'error');
    }
}

async function startScanner() {
    if (!API_URL) {
        showToast('Vui lòng cấu hình API URL trước!', 'error');
        switchPage('settings');
        return;
    }
    
    if (!currentUser.name || !currentUser.email) {
        showToast('Vui lòng cập nhật thông tin người dùng!', 'error');
        switchPage('settings');
        return;
    }
    
    try {
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };
        
        await scanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanError
        );
        
        showToast('Máy quét đã sẵn sàng', 'success');
    } catch (error) {
        console.error('Failed to start scanner:', error);
        
        // Try with user facing camera if environment camera fails
        try {
            await scanner.start(
                { facingMode: "user" },
                config,
                onScanSuccess,
                onScanError
            );
        } catch (err2) {
            showToast('Không thể mở camera. Vui lòng kiểm tra quyền truy cập.', 'error');
        }
    }
}

function stopScanner() {
    if (scanner) {
        scanner.stop().then(() => {
            console.log('Scanner stopped');
        }).catch(err => {
            console.error('Failed to stop scanner:', err);
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Stop scanner
    stopScanner();
    
    // Vibrate if available
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
    
    // Play sound
    playSound('success');
    
    // Process the scanned code
    processAssetCode(decodedText);
    
    // Add to scan history
    addToScanHistory(decodedText);
}

function onScanError(errorMessage) {
    // Handle scan error silently
    // Don't show error for every failed frame
}

function manualCheckIn() {
    const code = document.getElementById('manualCode').value.trim();
    
    if (!code) {
        showToast('Vui lòng nhập mã tài sản!', 'error');
        return;
    }
    
    if (!API_URL) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    // Process the code
    processAssetCode(code);
    
    // Clear input
    document.getElementById('manualCode').value = '';
    
    // Add to scan history
    addToScanHistory(code);
}

async function processAssetCode(code) {
    showLoading(true);
    
    try {
        // Get asset details from server
        const result = await apiCall('getAsset', { code: code });
        
        if (result.success) {
            currentAsset = result.asset;
            currentAsset._code = code;
            
            // Show asset detail modal
            showAssetDetailModal(result.asset);
        } else {
            showToast(`Không tìm thấy tài sản: ${code}`, 'error');
        }
    } catch (error) {
        console.error('Error processing asset:', error);
        showToast('Lỗi xử lý: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ====================================
// ASSET DETAIL MODAL
// ====================================

function showAssetDetailModal(asset) {
    // Build modal content
    let html = '<div class="asset-detail-grid">';
    
    // Main information
    const mainFields = [
        { label: 'Mã tài sản', value: asset['Code'], important: true },
        { label: 'Tên tài sản VN', value: asset['Tên tài sản Tiếng Việt'], important: true },
        { label: 'Tên tài sản EN', value: asset['Tên tiếng anh'] },
        { label: 'Loại', value: asset['Loại'] },
        { label: 'Model',// Continue showAssetDetailModal
        { label: 'Model', value: asset['Model'] },
        { label: 'Serial', value: asset['Serial'] },
        { label: 'Tech code', value: asset['Tech code'] },
        { label: 'Vị trí', value: asset['Vị trí'] },
        { label: 'Tình trạng', value: asset['Tình trạng'] },
        { label: 'Bộ phận sử dụng', value: asset['Bộ phận sử dụng'] },
        { label: 'Giá trị ban đầu', value: formatCurrency(asset['Giá trị ban đầu']) },
        { label: 'Ngày bắt đầu', value: formatDate(asset['Ngày bắt đầu']) },
        { label: 'Thời gian sử dụng', value: asset['Thời gian sử dụng'] },
        { label: 'Ngày kết thúc', value: formatDate(asset['Ngày kết thúc']) },
        { label: 'Khách hàng', value: asset['Khách hàng'] },
        { label: 'NCC', value: asset['NCC'] },
        { label: 'Nguồn cố', value: asset['Nguồn cố'] }
    ];
    
    mainFields.forEach(field => {
        const value = field.value || '<span class="empty">Chưa có dữ liệu</span>';
        const importantClass = field.important ? ' style="grid-column: span 2;"' : '';
        
        html += `
            <div class="asset-detail-item"${importantClass}>
                <div class="asset-detail-label">${field.label}</div>
                <div class="asset-detail-value ${!field.value ? 'empty' : ''}">${value}</div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Check inventory status
    const isChecked = asset['Check kiểm kê'] === '✓';
    
    if (isChecked) {
        html += `
            <div style="margin-top: 20px; padding: 16px; background: #D1FAE5; border-radius: var(--radius); border: 2px solid var(--success);">
                <h4 style="color: #065F46; margin-bottom: 8px;">✅ Đã kiểm kê</h4>
                <p style="color: #047857; margin: 0;">
                    Người kiểm kê: ${asset['Người kiểm kê'] || 'N/A'}<br>
                    Thời gian: ${asset['Thời gian kiểm kê'] || 'N/A'}
                </p>
            </div>
        `;
    } else {
        html += `
            <div style="margin-top: 20px; padding: 16px; background: #FEF3C7; border-radius: var(--radius); border: 2px solid var(--warning);">
                <h4 style="color: #92400E; margin-bottom: 8px;">⏳ Chưa kiểm kê</h4>
                <p style="color: #78350F; margin: 0;">
                    Tài sản này chưa được kiểm kê trong kỳ hiện tại
                </p>
            </div>
        `;
    }
    
    // Update form for editing (if needed)
    html += `
        <div style="margin-top: 20px;">
            <h4 style="margin-bottom: 12px;">Cập nhật thông tin (nếu cần):</h4>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Vị trí hiện tại</label>
                    <input type="text" class="form-control" id="updateLocation" 
                           value="${asset['Vị trí'] || currentUser.location || ''}"
                           placeholder="Nhập vị trí...">
                </div>
                <div class="form-group">
                    <label class="form-label">Tình trạng</label>
                    <select class="form-control" id="updateStatus">
                        <option value="Tốt" ${asset['Tình trạng'] === 'Tốt' ? 'selected' : ''}>✅ Tốt</option>
                        <option value="Trung bình" ${asset['Tình trạng'] === 'Trung bình' ? 'selected' : ''}>⚠️ Trung bình</option>
                        <option value="Hỏng" ${asset['Tình trạng'] === 'Hỏng' ? 'selected' : ''}>❌ Hỏng</option>
                        <option value="Đang sửa chữa" ${asset['Tình trạng'] === 'Đang sửa chữa' ? 'selected' : ''}>🔧 Đang sửa chữa</option>
                        <option value="Thanh lý" ${asset['Tình trạng'] === 'Thanh lý' ? 'selected' : ''}>🗑️ Thanh lý</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Serial Number</label>
                <input type="text" class="form-control" id="updateSerial" 
                       value="${asset['Serial'] || ''}"
                       placeholder="Nhập serial...">
            </div>
            <div class="form-group">
                <label class="form-label">Ghi chú</label>
                <textarea class="form-control" id="updateNotes" 
                          placeholder="Nhập ghi chú...">${asset['Ghi chú'] || ''}</textarea>
            </div>
        </div>
    `;
    
    // Insert content into modal
    document.getElementById('assetModalContent').innerHTML = html;
    
    // Update buttons based on check status
    const editBtn = document.getElementById('editAssetBtn');
    const confirmBtn = document.getElementById('confirmInventoryBtn');
    
    if (isChecked) {
        editBtn.style.display = 'inline-flex';
        confirmBtn.textContent = '🔄 Cập nhật kiểm kê';
    } else {
        editBtn.style.display = 'none';
        confirmBtn.textContent = '✅ Xác nhận kiểm kê';
    }
    
    // Show modal
    showModal('assetModal');
}

// ====================================
// INVENTORY FUNCTIONS
// ====================================

async function confirmInventory() {
    if (!currentAsset) {
        showToast('Không có tài sản nào được chọn!', 'error');
        return;
    }
    
    // Get updated values
    const updates = {
        'Vị trí': document.getElementById('updateLocation').value,
        'Tình trạng': document.getElementById('updateStatus').value,
        'Serial': document.getElementById('updateSerial').value
    };
    
    const notes = document.getElementById('updateNotes').value;
    
    showLoading(true);
    
    try {
        // Call API to update inventory
        const result = await apiCall('updateInventory', {
            code: currentAsset['Code'],
            updates: updates,
            notes: notes
        });
        
        if (result.success) {
            showToast('✅ Kiểm kê thành công!', 'success');
            
            // Close modal
            closeModal('assetModal');
            
            // Reload data
            loadDashboardData();
            
            // Update scan history
            updateScanHistory();
            
            // Play success sound
            playSound('success');
        }
    } catch (error) {
        console.error('Error confirming inventory:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function editAsset() {
    // Build edit form
    let html = '<div class="form-row">';
    
    // Get all fields from current asset
    const editableFields = [
        'Tên tài sản Tiếng Việt',
        'Tên tiếng anh',
        'Loại',
        'Model',
        'Serial',
        'Tech code',
        'Vị trí',
        'Tình trạng',
        'Bộ phận sử dụng',
        'Giá trị ban đầu',
        'Ngày bắt đầu',
        'Khách hàng',
        'NCC'
    ];
    
    editableFields.forEach(field => {
        const value = currentAsset[field] || '';
        const fieldId = field.replace(/\s/g, '_');
        
        html += `
            <div class="form-group">
                <label class="form-label">${field}</label>
                <input type="text" class="form-control" id="edit_${fieldId}" 
                       value="${value}" data-field="${field}">
            </div>
        `;
    });
    
    html += '</div>';
    
    document.getElementById('editAssetForm').innerHTML = html;
    
    // Show edit modal
    showModal('editModal');
}

async function saveAssetChanges() {
    const updates = {};
    
    // Collect all changes
    document.querySelectorAll('#editAssetForm input').forEach(input => {
        const field = input.dataset.field;
        const value = input.value;
        
        if (field && value !== currentAsset[field]) {
            updates[field] = value;
        }
    });
    
    if (Object.keys(updates).length === 0) {
        showToast('Không có thay đổi nào để lưu', 'info');
        return;
    }
    
    showLoading(true);
    
    try {
        const result = await apiCall('updateAssetInfo', {
            code: currentAsset['Code'],
            updates: updates
        });
        
        if (result.success) {
            showToast('✅ Đã cập nhật thông tin tài sản!', 'success');
            
            // Update current asset
            Object.assign(currentAsset, updates);
            
            // Close edit modal
            closeModal('editModal');
            
            // Refresh asset detail modal
            showAssetDetailModal(currentAsset);
        }
    } catch (error) {
        console.error('Error updating asset:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ====================================
// ASSET LIST FUNCTIONS
// ====================================

async function loadAssetList() {
    if (!API_URL) {
        document.getElementById('assetList').innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">⚙️</div>
                <div class="empty-title">Chưa cấu hình</div>
                <div class="empty-text">Vui lòng cấu hình API URL trong phần Cài đặt</div>
            </div>
        `;
        return;
    }
    
    document.getElementById('assetList').innerHTML = '<div class="spinner" style="grid-column: 1/-1;"></div>';
    
    try {
        const result = await apiCall('getAllAssets');
        
        if (result.success) {
            displayAssetList(result.assets);
            assetCache = result.assets; // Cache for offline
        }
    } catch (error) {
        console.error('Error loading assets:', error);
        
        // Try to use cached data
        if (assetCache.length > 0) {
            displayAssetList(assetCache);
            showToast('Đang sử dụng dữ liệu offline', 'warning');
        } else {
            document.getElementById('assetList').innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-icon">❌</div>
                    <div class="empty-title">Lỗi tải dữ liệu</div>
                    <div class="empty-text">${error.message}</div>
                </div>
            `;
        }
    }
}

function displayAssetList(assets) {
    const container = document.getElementById('assetList');
    
    if (!assets || assets.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">📦</div>
                <div class="empty-title">Không có tài sản</div>
                <div class="empty-text">Chưa có tài sản nào trong hệ thống</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    assets.forEach(asset => {
        const isChecked = asset['Check kiểm kê'] === '✓';
        const statusClass = isChecked ? 'checked' : '';
        
        html += `
            <div class="asset-card ${statusClass}" onclick="showAssetFromList('${asset['Code']}')">
                <div class="asset-card-header">
                    <div class="asset-code">${asset['Code'] || 'N/A'}</div>
                    <div class="asset-status ${isChecked ? 'badge-success' : 'badge-warning'}">
                        ${isChecked ? '✓ Đã kiểm kê' : '⏳ Chưa kiểm kê'}
                    </div>
                </div>
                
                <div class="asset-name">${asset['Tên tài sản Tiếng Việt'] || 'Chưa có tên'}</div>
                
                <div class="asset-details">
                    <div class="asset-detail">
                        <span class="asset-detail-icon">📍</span>
                        <span>${asset['Vị trí'] || 'N/A'}</span>
                    </div>
                    <div class="asset-detail">
                        <span class="asset-detail-icon">📦</span>
                        <span>${asset['Loại'] || 'N/A'}</span>
                    </div>
                    <div class="asset-detail">
                        <span class="asset-detail-icon">🔧</span>
                        <span>${asset['Tình trạng'] || 'N/A'}</span>
                    </div>
                    <div class="asset-detail">
                        <span class="asset-detail-icon">🏢</span>
                        <span>${asset['Bộ phận sử dụng'] || 'N/A'}</span>
                    </div>
                </div>
                
                <div class="asset-actions">
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); processAssetCode('${asset['Code']}')">
                        📷 Kiểm kê
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); viewAssetDetails('${asset['Code']}')">
                        👁️ Chi tiết
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function showAssetFromList(code) {
    // Find asset in cache
    const asset = assetCache.find(a => a['Code'] === code);
    
    if (asset) {
        currentAsset = asset;
        showAssetDetailModal(asset);
    } else {
        processAssetCode(code);
    }
}

function viewAssetDetails(code) {
    showAssetFromList(code);
}

async function searchAssets() {
    const query = document.getElementById('searchAssets').value.trim();
    
    if (!query) {
        loadAssetList();
        return;
    }
    
    if (!API_URL) return;
    
    document.getElementById('assetList').innerHTML = '<div class="spinner" style="grid-column: 1/-1;"></div>';
    
    try {
        const result = await apiCall('searchAssets', { query: query });
        
        if (result.success) {
            displayAssetList(result.results);
        }
    } catch (error) {
        console.error('Error searching assets:', error);
        
        // Search in cached data
        if (assetCache.length > 0) {
            const filtered = assetCache.filter(asset => {
                const searchLower = query.toLowerCase();
                return Object.values(asset).some(value => 
                    value && value.toString().toLowerCase().includes(searchLower)
                );
            });
            displayAssetList(filtered);
        }
    }
}

function refreshAssetList() {
    loadAssetList();
    showToast('Đang làm mới danh sách...', 'info');
}// ====================================
// QR CODE PRINTING
// ====================================

async function generateAllQR() {
    if (!API_URL) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    showLoading(true);
    showToast('Đang tạo mã QR...', 'info');
    
    try {
        const result = await apiCall('getQRData');
        
        if (result.success && result.qrData) {
            displayQRCodes(result.qrData);
        }
    } catch (error) {
        console.error('Error generating QR codes:', error);
        showToast('Lỗi tạo mã QR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function displayQRCodes(qrData) {
    // Create print preview
    let html = `
        <div style="margin-bottom: 20px;">
            <h3>Mã QR cho ${qrData.length} tài sản</h3>
            <p>Click vào nút in bên dưới để in tất cả mã QR</p>
            <button class="btn btn-primary" onclick="printQRCodes()">
                🖨️ In tất cả mã QR
            </button>
        </div>
        <div class="qr-print-grid" id="qrGrid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
    `;
    
    qrData.forEach(item => {
        const qrId = 'qr_' + item.code.replace(/[^a-zA-Z0-9]/g, '_');
        
        html += `
            <div class="qr-print-item" style="border: 1px solid #ddd; padding: 10px; text-align: center; border-radius: 8px;">
                <canvas id="${qrId}" style="margin: 0 auto;"></canvas>
                <div style="margin-top: 8px;">
                    <div style="font-weight: bold; font-size: 14px;">${item.code}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        ${item.nameVi || 'N/A'}
                    </div>
                    <div style="font-size: 10px; color: #999; margin-top: 2px;">
                        ${item.type || ''} | ${item.location || ''}
                    </div>
                    ${item.serial ? `<div style="font-size: 10px; color: #999;">SN: ${item.serial}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    document.getElementById('qrPreview').innerHTML = html;
    
    // Generate QR codes
    setTimeout(() => {
        qrData.forEach(item => {
            const qrId = 'qr_' + item.code.replace(/[^a-zA-Z0-9]/g, '_');
            const canvas = document.getElementById(qrId);
            
            if (canvas) {
                QRCode.toCanvas(canvas, item.code, {
                    width: 150,
                    margin: 1,
                    errorCorrectionLevel: 'M'
                }, function(error) {
                    if (error) console.error('QR Error:', error);
                });
            }
        });
    }, 100);
    
    // Store for printing
    window.qrDataForPrint = qrData;
}

function printQRCodes() {
    // Create print window
    const printWindow = window.open('', '_blank');
    
    if (!window.qrDataForPrint) {
        showToast('Không có dữ liệu QR để in', 'error');
        return;
    }
    
    const qrData = window.qrDataForPrint;
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>In mã QR tài sản</title>
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: Arial, sans-serif;
                    padding: 10mm;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                    page-break-after: avoid;
                }
                
                .qr-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10mm;
                    page-break-inside: avoid;
                }
                
                .qr-item {
                    border: 1px solid #000;
                    padding: 5mm;
                    text-align: center;
                    page-break-inside: avoid;
                    background: white;
                }
                
                .qr-code {
                    margin: 0 auto 5mm;
                    display: block;
                }
                
                .qr-label {
                    font-size: 12pt;
                    font-weight: bold;
                    margin-bottom: 2mm;
                }
                
                .qr-name {
                    font-size: 9pt;
                    margin-bottom: 1mm;
                    line-height: 1.2;
                }
                
                .qr-info {
                    font-size: 8pt;
                    color: #333;
                    line-height: 1.2;
                }
                
                @media print {
                    .no-print {
                        display: none;
                    }
                    
                    .qr-grid {
                        grid-template-columns: repeat(4, 1fr);
                    }
                    
                    @page {
                        margin: 10mm;
                        size: A4;
                    }
                }
                
                @media screen {
                    .print-only {
                        display: none;
                    }
                    
                    body {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header no-print">
                <h2>Mã QR Tài sản - ${qrData.length} mã</h2>
                <p>Tạo ngày: ${new Date().toLocaleDateString('vi-VN')}</p>
                <button onclick="window.print()" style="margin: 10px; padding: 10px 20px; font-size: 16px; background: #4F46E5; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🖨️ In tất cả
                </button>
            </div>
            
            <div class="qr-grid" id="qrContainer"></div>
            
            <script>
                const qrData = ${JSON.stringify(qrData)};
                const container = document.getElementById('qrContainer');
                
                qrData.forEach((item, index) => {
                    const div = document.createElement('div');
                    div.className = 'qr-item';
                    
                    const canvas = document.createElement('canvas');
                    canvas.className = 'qr-code';
                    canvas.id = 'qr_' + index;
                    
                    div.appendChild(canvas);
                    
                    const label = document.createElement('div');
                    label.className = 'qr-label';
                    label.textContent = item.code;
                    div.appendChild(label);
                    
                    if (item.nameVi) {
                        const name = document.createElement('div');
                        name.className = 'qr-name';
                        name.textContent = item.nameVi;
                        div.appendChild(name);
                    }
                    
                    const info = document.createElement('div');
                    info.className = 'qr-info';
                    
                    let infoText = [];
                    if (item.type) infoText.push(item.type);
                    if (item.location) infoText.push(item.location);
                    if (item.serial) infoText.push('SN: ' + item.serial);
                    
                    info.textContent = infoText.join(' | ');
                    if (infoText.length > 0) {
                        div.appendChild(info);
                    }
                    
                    container.appendChild(div);
                    
                    // Generate QR code
                    QRCode.toCanvas(canvas, item.code, {
                        width: 120,
                        margin: 1,
                        errorCorrectionLevel: 'M'
                    });
                });
                
                // Auto print after load
                window.onload = function() {
                    setTimeout(function() {
                        // window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

// ====================================
// INVENTORY LIST
// ====================================

async function loadInventoryList() {
    if (!API_URL) {
        document.getElementById('inventoryTable').innerHTML = `
            <tr><td colspan="7" class="text-center">Vui lòng cấu hình API URL</td></tr>
        `;
        return;
    }
    
    try {
        const result = await apiCall('getAllAssets');
        
        if (result.success) {
            displayInventoryTable(result.assets);
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
        document.getElementById('inventoryTable').innerHTML = `
            <tr><td colspan="7" class="text-center">Lỗi tải dữ liệu: ${error.message}</td></tr>
        `;
    }
}

function displayInventoryTable(assets) {
    const tbody = document.getElementById('inventoryTable');
    
    if (!assets || assets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Không có dữ liệu</td></tr>';
        return;
    }
    
    let html = '';
    
    assets.forEach(asset => {
        const isChecked = asset['Check kiểm kê'] === '✓';
        
        html += `
            <tr>
                <td>${asset['Code'] || ''}</td>
                <td>${asset['Tên tài sản Tiếng Việt'] || ''}</td>
                <td>${asset['Loại'] || ''}</td>
                <td>${asset['Vị trí'] || ''}</td>
                <td>
                    <span class="table-badge ${asset['Tình trạng'] === 'Tốt' ? 'badge-success' : 'badge-warning'}">
                        ${asset['Tình trạng'] || 'N/A'}
                    </span>
                </td>
                <td>
                    <span class="table-badge ${isChecked ? 'badge-success' : 'badge-warning'}">
                        ${isChecked ? '✓ Đã kiểm' : '⏳ Chưa'}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-primary" onclick="processAssetCode('${asset['Code']}')">
                            Kiểm kê
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// ====================================
// REPORTS
// ====================================

async function loadReports() {
    if (!API_URL) return;
    
    try {
        const stats = await apiCall('getStats');
        
        if (stats.success) {
            updateReportCharts(stats.stats);
            updateReportTables(stats.stats);
        }
    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Không thể tải báo cáo', 'error');
    }
}

function updateReportCharts(stats) {
    // Type chart
    const typeCtx = document.getElementById('typeChart');
    if (typeCtx && stats.byType) {
        if (window.typeChartInstance) {
            window.typeChartInstance.destroy();
        }
        
        const labels = Object.keys(stats.byType);
        const data = Object.values(stats.byType);
        
        window.typeChartInstance = new Chart(typeCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels// Continue updateReportCharts
                labels: labels,
                datasets: [{
                    label: 'Số lượng tài sản',
                    data: data,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Phân bố theo loại tài sản'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
}

function updateReportTables(stats) {
    // Location stats
    const locationContainer = document.getElementById('locationStats');
    if (locationContainer && stats.byLocation) {
        let html = '<div class="table-container"><table class="table"><thead><tr><th>Vị trí</th><th>Số lượng</th><th>Tỷ lệ</th></tr></thead><tbody>';
        
        const total = stats.totalAssets || 1;
        
        for (const [location, count] of Object.entries(stats.byLocation)) {
            const percentage = ((count / total) * 100).toFixed(1);
            html += `
                <tr>
                    <td>${location}</td>
                    <td>${count}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="flex: 1; height: 20px; background: var(--light); border-radius: 10px; overflow: hidden;">
                                <div style="height: 100%; width: ${percentage}%; background: var(--primary);"></div>
                            </div>
                            <span>${percentage}%</span>
                        </div>
                    </td>
                </tr>
            `;
        }
        
        html += '</tbody></table></div>';
        locationContainer.innerHTML = html;
    }
    
    // User stats
    const userContainer = document.getElementById('userStats');
    if (userContainer && stats.byUser) {
        let html = '<div class="table-container"><table class="table"><thead><tr><th>Người kiểm kê</th><th>Số lượng</th><th>Tiến độ</th></tr></thead><tbody>';
        
        for (const [user, count] of Object.entries(stats.byUser)) {
            html += `
                <tr>
                    <td>${user}</td>
                    <td>${count}</td>
                    <td>
                        <span class="table-badge badge-success">${count} tài sản</span>
                    </td>
                </tr>
            `;
        }
        
        html += '</tbody></table></div>';
        userContainer.innerHTML = html;
    }
}

async function generateReport() {
    if (!API_URL) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const result = await apiCall('exportReport');
        
        if (result.success) {
            showToast('✅ Đã tạo báo cáo thành công!', 'success');
            
            // Open report in new tab if URL provided
            if (result.url) {
                window.open(result.url, '_blank');
            }
        }
    } catch (error) {
        console.error('Error generating report:', error);
        showToast('Lỗi tạo báo cáo: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function exportReport() {
    await generateReport();
}

// ====================================
// RESET INVENTORY
// ====================================

function showResetModal() {
    showModal('resetModal');
}

async function confirmReset() {
    const confirmCode = document.getElementById('resetConfirmCode').value;
    
    if (confirmCode !== 'RESET2024') {
        showToast('Mã xác nhận không đúng!', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const result = await apiCall('resetInventory', {
            confirmCode: confirmCode
        });
        
        if (result.success) {
            showToast('✅ Đã reset kỳ kiểm kê. Backup: ' + result.backupSheet, 'success');
            
            // Clear local data
            scanHistory = [];
            localStorage.removeItem('scanHistory');
            
            // Close modal
            closeModal('resetModal');
            
            // Reload data
            loadDashboardData();
            loadInventoryList();
        }
    } catch (error) {
        console.error('Error resetting inventory:', error);
        showToast('Lỗi reset: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ====================================
// SCAN HISTORY
// ====================================

function addToScanHistory(code) {
    const scan = {
        code: code,
        timestamp: new Date().toISOString(),
        user: currentUser.name
    };
    
    scanHistory.unshift(scan);
    
    // Keep only last 50 scans
    if (scanHistory.length > 50) {
        scanHistory = scanHistory.slice(0, 50);
    }
    
    // Save to localStorage
    localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    
    // Update display
    updateScanHistory();
}

function updateScanHistory() {
    const container = document.getElementById('scanHistory');
    if (!container) return;
    
    if (scanHistory.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <div class="empty-title">Chưa có lịch sử</div>
                <div class="empty-text">Bắt đầu quét để xem lịch sử</div>
            </div>
        `;
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    
    scanHistory.slice(0, 10).forEach(scan => {
        const date = new Date(scan.timestamp);
        const timeStr = date.toLocaleTimeString('vi-VN');
        const dateStr = date.toLocaleDateString('vi-VN');
        
        html += `
            <div style="padding: 12px; border: 1px solid var(--light); border-radius: var(--radius); cursor: pointer;" 
                 onclick="processAssetCode('${scan.code}')">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: var(--primary);">${scan.code}</div>
                        <div style="font-size: 12px; color: var(--gray); margin-top: 4px;">
                            ${dateStr} ${timeStr}
                        </div>
                    </div>
                    <span class="table-badge badge-info">→</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ====================================
// OFFLINE SUPPORT
// ====================================

function handleOfflineAction(action, data) {
    // Store action in queue for later sync
    const offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    
    offlineQueue.push({
        action: action,
        data: data,
        timestamp: new Date().toISOString()
    });
    
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    
    // Return mock success for certain actions
    if (action === 'updateInventory') {
        showToast('Đã lưu offline. Sẽ đồng bộ khi có mạng.', 'warning');
        return { success: true, offline: true };
    }
    
    throw new Error('Không có kết nối mạng');
}

async function syncOfflineData() {
    const offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    
    if (offlineQueue.length === 0) return;
    
    showToast(`Đang đồng bộ ${offlineQueue.length} thao tác offline...`, 'info');
    
    let successCount = 0;
    
    for (const item of offlineQueue) {
        try {
            await apiCall(item.action, item.data);
            successCount++;
        } catch (error) {
            console.error('Sync error:', error);
        }
    }
    
    if (successCount > 0) {
        showToast(`✅ Đã đồng bộ ${successCount} thao tác`, 'success');
        localStorage.removeItem('offlineQueue');
        
        // Reload data
        loadDashboardData();
    }
}

// ====================================
// UI UTILITIES
// ====================================

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('show', show);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function showEmptyState(page) {
    // Show empty state for pages without data
    const messages = {
        dashboard: 'Vui lòng cấu hình API URL để bắt đầu',
        assets: 'Không có tài sản nào',
        inventory: 'Chưa có dữ liệu kiểm kê'
    };
    
    console.log('Empty state for:', page, messages[page]);
}

// ====================================
// HELPER FUNCTIONS
// ====================================

function formatCurrency(value) {
    if (!value || isNaN(value)) return '';
    
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(value);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        return date.toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function playSound(type) {
    try {
        const audio = new Audio();
        
        if (type === 'success') {
            // Success beep
            audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHW';
        } else {
            // Error beep
            audio.src = 'data:audio/wav;base64,UklGRl9vT29kaS9PGl4GRl9';
        }
        
        audio.play().catch(e => console.log('Audio play failed'));
    } catch (e) {
        console.log('Audio not supported');
    }
}

function initializeTooltips() {
    // Initialize any tooltips if needed
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(el => {
        el.addEventListener('mouseenter', showTooltip);
        el.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(e) {
    const text = e.target.dataset.tooltip;
    if (!text) return;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'var(--dark)';
    tooltip.style.color = 'var(--white)';
    tooltip.style.padding = '8px 12px';
    tooltip.style.borderRadius = 'var(--radius-sm)';
    tooltip.style.fontSize = '12px';
    tooltip.style.zIndex = '9999';
    
    document.body.appendChild(tooltip);
    
    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    
    e.target._tooltip = tooltip;
}

function hideTooltip(e) {
    if (e.target._tooltip) {
        e.target._tooltip.remove();
        delete e.target._tooltip;
    }
}

// ====================================
// KEYBOARD SHORTCUTS
// ====================================

document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K: Quick search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchAssets')?.focus();
    }
    
    // Ctrl/Cmd + Q: Quick scan
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
        e.preventDefault();
        switchPage('scan');
        document.getElementById('manualCode')?.focus();
    }
    
    // ESC: Close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(modal => {
            closeModal(modal.id);
        });
    }
});

// ====================================
// EXPORT FOR GLOBAL USE
// ====================================

window.AssetManager = {
    init: initializeApp,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    switchPage: switchPage,
    startScanner: startScanner,
    processAssetCode: processAssetCode,
    confirmInventory: confirmInventory,
    generateAllQR: generateAllQR,
    exportReport: exportReport,
    showToast: showToast
};

console.log('Asset Manager Pro loaded successfully!');