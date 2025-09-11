// ====================================
// ASSET MANAGER PRO - MAIN JAVASCRIPT
// ====================================

// Global Variables
let scanner = null;
let apiUrl = '';
let currentUser = '';
let currentLocation = '';
let recentScans = [];
let assetCache = {};
let inventoryChart = null;

// ====================================
// INITIALIZATION
// ====================================

document.addEventListener('DOMContentLoaded', function() {
    // Load settings from localStorage
    loadSettings();
    
    // Initialize QR Scanner
    initQRScanner();
    
    // Load initial data
    loadStats();
    
    // Set up periodic refresh
    setInterval(loadStats, 30000); // Refresh every 30 seconds
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('Service worker registration failed:', err);
        });
    }
});

// ====================================
// SETTINGS MANAGEMENT
// ====================================

function loadSettings() {
    apiUrl = localStorage.getItem('apiUrl') || '';
    currentUser = localStorage.getItem('userName') || '';
    currentLocation = localStorage.getItem('userLocation') || '';
    
    document.getElementById('apiUrl').value = apiUrl;
    document.getElementById('userName').value = currentUser;
    document.getElementById('userLocation').value = currentLocation;
    
    // Load recent scans
    const savedScans = localStorage.getItem('recentScans');
    if (savedScans) {
        recentScans = JSON.parse(savedScans);
        updateRecentScans();
    }
}

function saveSettings() {
    apiUrl = document.getElementById('apiUrl').value.trim();
    currentUser = document.getElementById('userName').value.trim();
    currentLocation = document.getElementById('userLocation').value.trim();
    
    if (!apiUrl) {
        showToast('Vui lòng nhập API URL!', 'error');
        return;
    }
    
    localStorage.setItem('apiUrl', apiUrl);
    localStorage.setItem('userName', currentUser);
    localStorage.setItem('userLocation', currentLocation);
    
    showToast('Đã lưu cài đặt thành công!', 'success');
    loadStats();
}

// ====================================
// TAB NAVIGATION
// ====================================

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Add active class to clicked nav tab
    event.target.classList.add('active');
    
    // Load data for specific tabs
    if (tabName === 'list') {
        loadAssetList();
    } else if (tabName === 'report') {
        loadReportData();
    }
}

// ====================================
// QR SCANNER FUNCTIONS
// ====================================

function initQRScanner() {
    scanner = new Html5Qrcode("qr-reader");
}

function startScanner() {
    if (!apiUrl) {
        showToast('Vui lòng cấu hình API URL trước!', 'error');
        switchTab('settings');
        return;
    }
    
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };
    
    scanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
    ).catch(err => {
        console.error('Failed to start scanner:', err);
        showToast('Không thể khởi động camera. Vui lòng kiểm tra quyền truy cập.', 'error');
    });
}

function stopScanner() {
    if (scanner) {
        scanner.stop().catch(err => {
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
    
    // Process scanned code
    processAssetCode(decodedText);
}

function onScanError(errorMessage) {
    // Handle scan error silently
}

function manualCheckIn() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code) {
        showToast('Vui lòng nhập mã tài sản!', 'error');
        return;
    }
    
    processAssetCode(code);
    document.getElementById('manualCode').value = '';
}

// ====================================
// ASSET PROCESSING
// ====================================

async function processAssetCode(code) {
    if (!apiUrl) {
        showToast('Chưa cấu hình API URL!', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Get asset details
        const assetResponse = await apiCall('getAsset', { code: code });
        
        if (!assetResponse.success) {
            showToast('Không tìm thấy tài sản: ' + code, 'error');
            showLoading(false);
            return;
        }
        
        const asset = assetResponse.asset;
        const invStatus = assetResponse.inventoryStatus;
        
        // Show asset modal for confirmation
        showAssetModal(asset, invStatus, code);
        
    } catch (error) {
        console.error('Error processing asset:', error);
        showToast('Lỗi xử lý: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function showAssetModal(asset, invStatus, code) {
    // Create modal HTML
    const modalHtml = `
        <div class="modal show" id="assetModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Thông tin tài sản</h3>
                    <button class="modal-close" onclick="closeModal('assetModal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="asset-item ${invStatus.checked ? 'checked' : ''}">
                        <div class="asset-code">${code}</div>
                        <div class="asset-name">${asset['Tên tài sản Tiếng Việt'] || asset['Tên tài sản'] || 'N/A'}</div>
                        <div class="asset-info">
                            <span>📍 ${asset['Vị trí'] || 'Chưa xác định'}</span>
                            <span>📦 ${asset['Nhóm'] || 'N/A'}</span>
                        </div>
                        ${invStatus.checked ? `
                            <div style="margin-top: 10px; padding: 10px; background: #D1FAE5; border-radius: 8px;">
                                <strong style="color: #065F46;">✅ Đã kiểm kê</strong><br>
                                <small>Ngày: ${invStatus.date} ${invStatus.time}<br>
                                Người: ${invStatus.user}</small>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${!invStatus.checked || confirm('Cập nhật thông tin?') ? `
                    <div style="margin-top: 20px;">
                        <div class="form-group">
                            <label class="form-label">Vị trí hiện tại:</label>
                            <input type="text" class="form-control" id="updateLocation" 
                                value="${currentLocation || asset['Vị trí'] || ''}" 
                                placeholder="Nhập vị trí...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Tình trạng:</label>
                            <select class="form-control" id="updateStatus">
                                <option value="Tốt">✅ Tốt</option>
                                <option value="Trung bình">⚠️ Trung bình</option>
                                <option value="Hỏng">❌ Hỏng</option>
                                <option value="Đang sửa chữa">🔧 Đang sửa chữa</option>
                                <option value="Thanh lý">🗑️ Thanh lý</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Serial Number:</label>
                            <input type="text" class="form-control" id="updateSerial" 
                                value="${asset['Serial'] || ''}" 
                                placeholder="Nhập serial...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ghi chú:</label>
                            <textarea class="form-control" id="updateNotes" 
                                placeholder="Nhập ghi chú..."></textarea>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('assetModal')">Đóng</button>
                    ${!invStatus.checked ? `
                        <button class="btn btn-success" onclick="confirmInventory('${code}')">
                            ✅ Xác nhận kiểm kê
                        </button>
                    ` : `
                        <button class="btn btn-primary" onclick="updateInventory('${code}')">
                            🔄 Cập nhật thông tin
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function confirmInventory(code) {
    const location = document.getElementById('updateLocation').value;
    const status = document.getElementById('updateStatus').value;
    const serial = document.getElementById('updateSerial').value;
    const notes = document.getElementById('updateNotes').value;
    
    showLoading(true);
    
    try {
        const response = await apiCall('updateInventory', {
            code: code,
            user: currentUser ||// Continuing from confirmInventory function...
            user: currentUser || 'Anonymous',
            location: location,
            status: status,
            serial: serial,
            notes: notes
        });
        
        if (response.success) {
            // Add to recent scans
            addToRecentScans({
                code: code,
                time: new Date().toLocaleString('vi-VN'),
                status: 'checked'
            });
            
            showToast('✅ Kiểm kê thành công!', 'success');
            closeModal('assetModal');
            
            // Reload stats
            loadStats();
            
            // Play success sound
            playSound('success');
        } else {
            if (response.duplicate) {
                showToast('⚠️ Tài sản đã được kiểm kê trong kỳ này!', 'warning');
            } else {
                showToast('❌ Lỗi: ' + response.error, 'error');
            }
        }
    } catch (error) {
        console.error('Error confirming inventory:', error);
        showToast('❌ Lỗi kết nối: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function updateInventory(code) {
    // Similar to confirmInventory but for updating existing records
    await confirmInventory(code);
}

// ====================================
// API COMMUNICATION
// ====================================

async function apiCall(action, data = {}) {
    if (!apiUrl) {
        throw new Error('API URL not configured');
    }
    
    const payload = {
        action: action,
        ...data
    };
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'no-cors', // Important for Google Apps Script
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        // For no-cors mode, we need to handle differently
        if (response.type === 'opaque') {
            // Try alternative method with GET
            const urlParams = new URLSearchParams(payload);
            const getResponse = await fetch(`${apiUrl}?${urlParams}`, {
                method: 'GET',
                redirect: 'follow'
            });
            
            const text = await getResponse.text();
            return JSON.parse(text);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        
        // Fallback to GET method
        try {
            const urlParams = new URLSearchParams(payload);
            const response = await fetch(`${apiUrl}?${urlParams}`, {
                method: 'GET',
                redirect: 'follow'
            });
            const text = await response.text();
            return JSON.parse(text);
        } catch (fallbackError) {
            throw new Error('Unable to connect to API');
        }
    }
}

// ====================================
// STATISTICS & REPORTING
// ====================================

async function loadStats() {
    if (!apiUrl) return;
    
    try {
        const response = await apiCall('getStats');
        
        if (response.success) {
            const stats = response.stats;
            
            // Update dashboard
            document.getElementById('totalAssets').textContent = stats.totalAssets;
            document.getElementById('checkedAssets').textContent = stats.inventoried;
            document.getElementById('progressPercent').textContent = stats.percentage + '%';
            
            // Store in cache
            localStorage.setItem('lastStats', JSON.stringify(stats));
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        
        // Load from cache if available
        const cached = localStorage.getItem('lastStats');
        if (cached) {
            const stats = JSON.parse(cached);
            document.getElementById('totalAssets').textContent = stats.totalAssets;
            document.getElementById('checkedAssets').textContent = stats.inventoried;
            document.getElementById('progressPercent').textContent = stats.percentage + '%';
        }
    }
}

async function loadReportData() {
    if (!apiUrl) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('getStats');
        
        if (response.success) {
            const stats = response.stats;
            
            // Update chart
            updateInventoryChart(stats);
            
            // Update user stats
            updateUserStats(stats.byUser);
            
            // Update location stats
            updateLocationStats(stats.byLocation);
        }
    } catch (error) {
        console.error('Error loading report:', error);
        showToast('Lỗi tải báo cáo: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function updateInventoryChart(stats) {
    const ctx = document.getElementById('inventoryChart').getContext('2d');
    
    if (inventoryChart) {
        inventoryChart.destroy();
    }
    
    inventoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Đã kiểm kê', 'Chưa kiểm kê'],
            datasets: [{
                data: [stats.inventoried, stats.pending],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)'
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
                    text: `Tiến độ kiểm kê kỳ ${stats.period || 'hiện tại'}`
                }
            }
        }
    });
}

function updateUserStats(byUser) {
    const container = document.getElementById('userStats');
    if (!byUser || Object.keys(byUser).length === 0) {
        container.innerHTML = '<div class="empty-state"><small>Chưa có dữ liệu</small></div>';
        return;
    }
    
    let html = '';
    for (const [user, count] of Object.entries(byUser)) {
        html += `
            <div class="asset-item" style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>👤 ${user}</span>
                    <span class="asset-badge success">${count} tài sản</span>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function updateLocationStats(byLocation) {
    const container = document.getElementById('locationStats');
    if (!byLocation || Object.keys(byLocation).length === 0) {
        container.innerHTML = '<div class="empty-state"><small>Chưa có dữ liệu</small></div>';
        return;
    }
    
    let html = '';
    for (const [location, count] of Object.entries(byLocation)) {
        html += `
            <div class="asset-item" style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>📍 ${location}</span>
                    <span class="asset-badge info">${count} tài sản</span>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// ====================================
// ASSET LIST MANAGEMENT
// ====================================

async function loadAssetList() {
    if (!apiUrl) {
        document.getElementById('assetList').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚙️</div>
                <div class="empty-title">Chưa cấu hình</div>
                <div class="empty-text">Vui lòng cấu hình API URL trong phần Cài đặt</div>
            </div>
        `;
        return;
    }
    
    document.getElementById('assetList').innerHTML = '<div class="spinner"></div>';
    
    try {
        const response = await apiCall('searchAssets', { query: '' });
        
        if (response.success) {
            displayAssetList(response.results);
        }
    } catch (error) {
        console.error('Error loading assets:', error);
        document.getElementById('assetList').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <div class="empty-title">Lỗi tải dữ liệu</div>
                <div class="empty-text">${error.message}</div>
            </div>
        `;
    }
}

async function searchAssets() {
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        loadAssetList();
        return;
    }
    
    if (!apiUrl) return;
    
    document.getElementById('assetList').innerHTML = '<div class="spinner"></div>';
    
    try {
        const response = await apiCall('searchAssets', { query: query });
        
        if (response.success) {
            displayAssetList(response.results);
        }
    } catch (error) {
        console.error('Error searching assets:', error);
    }
}

function displayAssetList(assets) {
    const container = document.getElementById('assetList');
    
    if (!assets || assets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">Không tìm thấy</div>
                <div class="empty-text">Thử tìm kiếm với từ khóa khác</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    assets.forEach(asset => {
        const code = asset['Mã tài sản'] || asset['Code'] || '';
        const name = asset['Tên tài sản Tiếng Việt'] || asset['Tên tài sản'] || 'N/A';
        const location = asset['Vị trí'] || 'N/A';
        const status = asset['Tình trạng'] || 'N/A';
        
        html += `
            <div class="asset-item" onclick="processAssetCode('${code}')">
                <div class="asset-code">${code}</div>
                <div class="asset-name">${name}</div>
                <div class="asset-info">
                    <span>📍 ${location}</span>
                    <span>📦 ${status}</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ====================================
// QR CODE GENERATION
// ====================================

async function generateQRCodes() {
    if (!apiUrl) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    if (!confirm('Tạo mã QR cho tất cả tài sản? Quá trình này có thể mất vài phút.')) {
        return;
    }
    
    showLoading(true);
    showToast('Đang tạo mã QR...', 'info');
    
    try {
        const response = await apiCall('generateQRCodes');
        
        if (response.success) {
            displayQRCodes(response.qrData);
        }
    } catch (error) {
        console.error('Error generating QR codes:', error);
        showToast('Lỗi tạo mã QR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function displayQRCodes(qrData) {
    // Create print window
    const printWindow = window.open('', '_blank');
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>In mã QR tài sản</title>
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 0;
                    padding: 20px;
                }
                .qr-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                    page-break-inside: avoid;
                }
                .qr-item {
                    text-align: center;
                    border: 1px solid #ddd;
                    padding: 10px;
                    border-radius: 8px;
                    page-break-inside: avoid;
                }
                .qr-code {
                    margin: 10px auto;
                }
                .qr-label {
                    font-size: 12px;
                    font-weight: bold;
                    margin-top: 5px;
                }
                .qr-name {
                    font-size: 10px;
                    color: #666;
                    margin-top: 3px;
                }
                @media print {
                    .no-print { display: none; }
                    .qr-grid { grid-template-columns: repeat(4, 1fr); }
                }
            </style>
        </head>
        <body>
            <h2 class="no-print">Mã QR Tài sản - ${qrData.length} mã</h2>
            <button onclick="window.print()" class="no-print" style="margin-bottom: 20px; padding: 10px 20px; background: #4F46E5; color: white; border: none; border-radius: 5px; cursor: pointer;">
                🖨️ In tất cả
            </button>
            <div class="qr-grid" id="qrContainer"></div>
            <script>
                const qrData = ${JSON.stringify(qrData)};
                const container = document.getElementById('qrContainer');
                
                qrData.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'qr-item';
                    
                    const canvas = document.createElement('canvas');
                    canvas.className = 'qr-code';
                    
                    QRCode.toCanvas(canvas, item.code, {
                        width: 150,
                        margin: 1
                    });
                    
                    div.appendChild(canvas);
                    div.innerHTML += '<div class="qr-label">' + item.code + '</div>';
                    div.innerHTML += '<div class="qr-name">' + (item.name || '') + '</div>';
                    
                    container.appendChild(div);
                });
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

// ====================================
// RECENT SCANS MANAGEMENT
// ====================================

function addToRecentScans(scan) {
    recentScans.unshift(scan);
    
    // Keep only last 10 scans
    if (recentScans.length > 10) {
        recentScans = recentScans.slice(0, 10);
    }
    
    // Save to localStorage
    localStorage.setItem('recentScans', JSON.stringify(recentScans));
    
    // Update display
    updateRecentScans();
}

function updateRecentScans() {
    const container = document.getElementById('recentScans');
    
    if (recentScans.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <div class="empty-title">Chưa có dữ liệu</div>
                <div class="empty-text">Bắt đầu quét để xem lịch sử</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    recentScans.forEach(scan => {
        html += `
            <div class="asset-item ${scan.status === 'checked' ? 'checked' : ''}">
                <div class="asset-code">${scan.code}</div>
                <div class="asset-info">
                    <span>🕐 ${scan.time}</span>
                    <span class="asset-badge ${scan.status === 'checked' ? 'success' : 'warning'}">
                        ${scan.status === 'checked' ? '✅ Đã kiểm kê' : '⏳ Đang xử lý'}
                    </span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ====================================
// RESET INVENTORY
// ====================================

function confirmReset() {
    if (!apiUrl) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    const confirmText = prompt('Nhập "RESET" để xác nhận xóa dữ liệu kiểm kê:');
    
    if (confirmText !== 'RESET') {
        showToast('Đã hủy thao tác reset', 'info');
        return;
    }
    
    resetInventory();
}

async function resetInventory() {
    showLoading(true);
    
    try {
        const period = new Date().toISOString();
        const response = await apiCall('resetInventory', { period: period });
        
        if (response.success) {
            // Clear local data
            recentScans = [];
            localStorage.removeItem('recentScans');
            updateRecentScans();
            
            showToast('✅ Đã reset kỳ kiểm kê. Backup: ' + response.backup, 'success');
            
            // Reload stats
            loadStats();
        } else {
            showToast('❌ Lỗi reset: ' + response.error, 'error');
        }
    } catch (error) {
        console.error('Error resetting inventory:', error);
        showToast('❌ Lỗi kết nối: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ====================================
// UI UTILITIES
// ====================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;
    
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading(show) {
    let overlay = document.querySelector('.loading-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div style="text-align: center;">
                <div class="spinner"></div>
                <div style="margin-top: 10px; color: var(--primary); font-weight: 600;">
                    Đang xử lý...
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    overlay.classList.toggle('show', show);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    }
}

function playSound(type) {
    try {
        const audio = new Audio();
        if (type === 'success') {
            // Success beep
            audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE';
        } else {
            // Error beep
            audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE';
        }
        audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
        console.log('Audio not supported');
    }
}

// ====================================
// EXPORT FUNCTIONS
// ====================================

async function exportReport() {
    if (!apiUrl) {
        showToast('Vui lòng cấu hình API URL!', 'error');
        return;
    }
    
    showToast('Đang tạo báo cáo...', 'info');
    
    // In real implementation, this would call the API to generate Excel
    // For now, we'll export as CSV
    
    try {
        const response = await apiCall('getStats');
        
        if (response.success) {
            const stats = response.stats;
            
            // Create CSV content
            let csv = 'Báo cáo kiểm kê tài sản\n';
            csv += `Kỳ kiểm kê: ${stats.period}\n`;
            csv += `Tổng tài sản: ${stats.totalAssets}\n`;
            csv += `Đã kiểm kê: ${stats.inventoried}\n`;
            csv += `Chưa kiểm kê: ${stats.pending}\n`;
            csv += `Tiến độ: ${stats.percentage}%\n\n`;
            
            csv += 'Theo người kiểm kê:\n';
            for (const [user, count] of Object.entries(stats.byUser || {})) {
                csv += `${user}: ${count}\n`;
            }
            
            csv += '\nTheo vị trí:\n';
            for (const [location, count] of Object.entries(stats.byLocation || {})) {
                csv += `${location}: ${count}\n`;
            }
            
            // Download CSV
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `BaoCao_KiemKe_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            
            showToast('✅ Đã xuất báo cáo thành công!', 'success');
        }
    } catch (error) {
        console.error('Error exporting report:', error);
        showToast('❌ Lỗi xuất báo cáo: ' + error.message, 'error');
    }
}
