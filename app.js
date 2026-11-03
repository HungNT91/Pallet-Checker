        // ============================================================
// Supabase client
// Thay YOUR_PROJECT_URL và YOUR_ANON_KEY bằng giá trị thật của bạn
// (lấy trong Supabase Dashboard > Project Settings > API)
// ============================================================
const sb = window.supabase.createClient(
    'https://wjexryzmwpencqgncstu.supabase.co',
    'sb_publishable_yeuIIVepdABAC9TV5iMBAg_yQRukGLm'
);

let html5QrCode;
        let currentPalletId = null;
        let currentTicketId = null; // To track currently viewed ticket
        let destinations = [];
        let historyData = []; // Cache for transfer history
        let currentUser = null; // Global user storage
        let scanContext = 'PALLET'; // 'PALLET' or 'DEST'

        // --- Core Functions ---
        function toggleAccordion(id) {
            document.getElementById(id).classList.toggle('open');
        }

        function openHistory() {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-history').classList.add('active');

            // Render from cache first for immediate display
            if (historyData && historyData.length > 0) {
                renderHistoryCards(historyData, true);
                // Also fetch in background to refresh
                fetchHistory(true);
            } else {
                fetchHistory();
            }
        }

        async function fetchHistory(isBackground = false) {
            const list = document.getElementById('history-list');
            if (!isBackground) {
                list.innerHTML = '<div class="empty-section">Đang tải dữ liệu...</div>';
            }

            const { data, error } = await sb
                .from('transfer_history')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                if (!isBackground) {
                    list.innerHTML = `<div class="empty-section" style="color:#ef4444">Lỗi máy chủ: ${error.message}</div>`;
                }
                return;
            }

            // Map lại tên field cho khớp với UI cũ (ticketId, palletId, destId, destName, user, timestamp)
            historyData = data.map(row => ({
                ticketId: row.ticket_id,
                palletId: row.pallet_id,
                destId: row.dest_id,
                destName: row.dest_name,
                user: row.performed_by_name,
                status: row.status,
                timestamp: new Date(row.created_at).toLocaleString('vi-VN')
            }));
            renderHistoryCards(historyData, true);
        }

        function renderHistoryCards(data, isInitialLoad = false) {
            const list = document.getElementById('history-list');
            list.innerHTML = '';

            if (!data || data.length === 0) {
                list.innerHTML = '<div class="empty-section">Chưa có dữ liệu luân chuyển</div>';
                return;
            }

            if (isInitialLoad) {
                populateFilters(data);
                applyFilters(); // Re-apply current filters to the new data
                return;
            }

            data.forEach(item => {
                const card = document.createElement('div');
                card.className = 'transfer-card';
                card.onclick = (e) => {
                    if (e.target.innerText !== 'content_copy') showTicketDetail(item);
                };
                card.style.cursor = 'pointer';
                card.innerHTML = `
                    <div class="card-top">
                        <div class="card-code">${item.ticketId} <span class="material-icons-round" style="font-size:1.1rem; color:var(--primary-blue); cursor:pointer;" onclick="event.stopPropagation(); copyToClipboard('${item.ticketId}')">content_copy</span></div>
                        <div class="status-badge ${item.status === 'Chờ' ? 'status-cho' : ''}">${item.status}</div>
                    </div>
                     <div class="location-step">
                        <span class="material-icons-round" style="color:var(--primary-blue)">qr_code</span>
                        <span>Pallet: <b>${item.palletId}</b></span>
                    </div>
                    <div class="location-step">
                        <span class="material-icons-round" style="color:#f97316">location_on</span>
                        <span>${item.destId} - ${item.destName}</span>
                    </div>
                    <hr class="card-divider">
                    <div class="card-info-row"><span>Ngày tạo</span> <span class="card-info-val">${item.timestamp}</span></div>
                    <div class="card-info-row"><span>Người thực hiện</span> <span class="card-info-val">${String(item.user).split('@')[0]}</span></div>
                `;
                list.appendChild(card);
            });
        }

        function showTicketDetail(item) {
            currentTicketId = item.ticketId;
            document.getElementById('det-ticket-id').innerText = item.ticketId;
            document.getElementById('det-pallet-id').innerText = item.palletId;
            document.getElementById('det-dest-id').innerText = item.destId + ' - ' + item.destName;
            document.getElementById('det-user').innerText = String(item.user).split('@')[0];
            document.getElementById('det-time').innerText = item.timestamp;

            document.getElementById('label-pallet').innerText = item.palletId;
            document.getElementById('label-dest').innerText = item.destId;

            // Handle Buttons based on status
            const btnClose = document.getElementById('btn-close-det');
            const btnConfirm = document.getElementById('btn-confirm-det');
            const btnPrint = document.getElementById('btn-print-det');

            if (item.status === 'Chờ') {
                btnClose.style.flex = "1";
                btnConfirm.style.display = "block";
                btnConfirm.style.flex = "2";
                btnPrint.style.display = "none";
            } else {
                // Hoàn tất: Only ĐÓNG
                btnClose.style.flex = "1";
                btnConfirm.style.display = "none";
                btnPrint.style.display = "none";
            }

            // Generate QRs
            generateTicketQR('qr-pallet', item.palletId);
            generateTicketQR('qr-dest', item.destId);

            document.getElementById('modal-ticket').style.display = 'flex';
        }

        function populateFilters(data) {
            const destSelect = document.getElementById('filter-dest');
            const userSelect = document.getElementById('filter-user');

            // Get current values to preserve them if possible, but usually we call this on fresh data
            const currentDest = destSelect.value;
            const currentUserVal = userSelect.value;

            // Extract unique values
            const dests = [...new Set(data.map(item => `${String(item.destId).trim()} - ${String(item.destName).trim()}`))].sort();
            const users = [...new Set(data.map(item => String(item.user).split('@')[0].trim()))].sort();

            // Populate Dest
            destSelect.innerHTML = '<option value="">Vị trí đích: Tất cả</option>';
            dests.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.innerText = d;
                destSelect.appendChild(opt);
            });
            destSelect.value = currentDest;

            // Populate User
            userSelect.innerHTML = '<option value="">Người thực hiện: Tất cả</option>';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u;
                opt.innerText = u;
                userSelect.appendChild(opt);
            });
            userSelect.value = currentUserVal;
        }

        function applyFilters() {
            if (!historyData) return;

            const destVal = document.getElementById('filter-dest').value;
            const userVal = document.getElementById('filter-user').value;
            const statusVal = document.getElementById('filter-status').value;

            const filtered = historyData.filter(item => {
                const itemDest = `${String(item.destId).trim()} - ${String(item.destName).trim()}`;
                const itemUser = String(item.user).split('@')[0].trim();
                
                const matchDest = !destVal || itemDest === destVal;
                const matchUser = !userVal || itemUser === userVal;
                const matchStatus = !statusVal || item.status === statusVal;
                return matchDest && matchUser && matchStatus;
            });

            renderHistoryCards(filtered, false);
        }

        async function confirmCurrentTicket() {
            if (!currentTicketId) return;

            const btnConfirm = document.getElementById('btn-confirm-det');
            const originalText = btnConfirm.innerText;
            btnConfirm.innerText = "ĐANG XỬ LÝ...";
            btnConfirm.disabled = true;

            const { data: res, error } = await sb.rpc('confirm_transfer_ticket', {
                p_ticket_id: currentTicketId,
                p_staff_name: currentUser ? currentUser.name : 'Unknown'
            });

            btnConfirm.innerText = originalText;
            btnConfirm.disabled = false;

            if (error) {
                alert("Lỗi hệ thống: " + error.message);
                return;
            }
            if (res.success) {
                showToast(res.message);
                closeTicketDetail();
                fetchHistory(true); // Background refresh
            } else {
                alert("Lỗi: " + res.message);
            }
        }

        function showToast(message) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `
                <div class="toast-icon">
                    <span class="material-icons-round">check</span>
                </div>
                <div class="toast-text">${message}</div>
            `;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3100);
        }

        function generateTicketQR(divId, text) {
            const container = document.getElementById(divId);
            container.innerHTML = '';
            new QRCode(container, {
                text: text,
                width: 80,
                height: 80,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        function closeTicketDetail() {
            document.getElementById('modal-ticket').style.display = 'none';
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                // Subtle feedback
                alert('Đã sao chép: ' + text);
            });
        }

        function goHome() {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-home').classList.add('active');
        }

        function openScanner(context = 'PALLET') {
            scanContext = context;
            const title = context === 'PALLET' ? 'Quét mã Pallet' : 'Quét mã Vị trí';
            const footer = context === 'PALLET' ? 'Vui lòng quét mã QR trên Pallet' : 'Vui lòng quét mã QR tại Vị trí đích';
            const bottomIcon = context === 'PALLET' ? 'pallet' : 'location_on';
            const bottomLabel = context === 'PALLET' ? 'Quét pallet' : 'Quét vị trí';

            document.getElementById('scanner-title').innerText = title;
            document.getElementById('scanner-footer-text').innerText = footer;
            document.getElementById('scanner-bottom-icon').innerText = bottomIcon;
            document.getElementById('scanner-bottom-label').innerText = bottomLabel;

            document.getElementById('page-scanner').classList.remove('hidden');
            document.getElementById('page-scanner').style.display = 'flex';

            if (context === 'DEST') {
                closeLocationPicker();
                document.getElementById('sheet-pallet-confirm').classList.remove('active');
            }

            startScanner();
        }

        async function closeScanner() {
            closeManualInput();
            // Dừng scanner và dọn sạch instance (quan trọng trên iOS để giải phóng camera)
            if (html5QrCode) {
                try { await html5QrCode.stop(); } catch (_) {}
                try { html5QrCode.clear(); } catch (_) {}
                html5QrCode = null;
            }
            document.getElementById('page-scanner').classList.add('hidden');
            document.getElementById('page-scanner').style.display = 'none';
            // Khi user bấm Back thủ công, restore sheet pallet nếu đang quét DEST
            if (scanContext === 'DEST') {
                document.getElementById('sheet-pallet-confirm').classList.add('active');
            }
        }

        // Thử lại camera — hữu ích khi iOS lần đầu không nhận được camera
        async function retryScanner() {
            closeManualInput();
            if (html5QrCode) {
                try { await html5QrCode.stop(); } catch (_) {}
                try { html5QrCode.clear(); } catch (_) {}
                html5QrCode = null;
            }
            // Xóa nội dung reader để tránh lỗi "element already in use"
            const reader = document.getElementById('reader');
            if (reader) reader.innerHTML = '';
            await startScanner();
        }

        // --- Manual Entry Functions ---
        let isManualInputActive = false;

        function openManualInput() {
            isManualInputActive = true;

            // Tạm dừng camera nếu đang quét để tránh giật lag / đứng bàn phím iOS và tránh quét nhầm khi đang gõ
            if (html5QrCode) {
                try {
                    if (typeof html5QrCode.pause === 'function') {
                        html5QrCode.pause(true);
                    }
                } catch (_) {}
            }

            const backdrop = document.getElementById('manual-backdrop');
            if (backdrop) backdrop.style.display = 'block';

            const sheet = document.getElementById('sheet-manual');
            if (sheet) {
                sheet.style.bottom = '0px';
                sheet.classList.add('active');
            }

            // iOS WebKit fix: Tránh gọi .focus() ngay lập tức trong khi CSS transform đang chạy
            // vì sẽ khiến bàn phím ảo iOS bị lệch toạ độ, đơ touch target hoặc treo input.
            setTimeout(() => {
                const input = document.getElementById('manual-pallet-id');
                if (input) {
                    input.focus();
                }
            }, 300);
        }

        function closeManualInput() {
            isManualInputActive = false;

            const backdrop = document.getElementById('manual-backdrop');
            if (backdrop) backdrop.style.display = 'none';

            const sheet = document.getElementById('sheet-manual');
            if (sheet) {
                sheet.classList.remove('active');
                sheet.style.bottom = '';
            }

            const errorDiv = document.getElementById('manual-error');
            if (errorDiv) errorDiv.style.display = 'none';

            const input = document.getElementById('manual-pallet-id');
            if (input) {
                input.value = '';
                input.blur();
            }

            // Phục hồi lại camera khi đóng hộp thoại nhập thủ công
            if (html5QrCode) {
                try {
                    if (typeof html5QrCode.resume === 'function') {
                        html5QrCode.resume();
                    }
                } catch (_) {}
            }
        }

        function validatePalletId(id) {
            // Regex for K or T followed by 1 to 5 digits
            // Need to handle padding rule: 1-9 must have leading zero. 10+ is fine.
            const regex = /^[KT](\d{2,5})$/;
            if (!regex.test(id)) return false;

            const match = id.match(/^[KT](\d+)$/);
            const numPart = match[1];
            const num = parseInt(numPart, 10);

            // Validation: num between 1 and 10000
            if (num < 1 || num > 10000) return false;

            // Padding rule: If num < 10, it MUST be 2 digits (e.g., 01, 09)
            if (num < 10 && numPart.length === 1) return false;

            // Re-check padding for single digit: if input was K1 -> fail. if K01 -> pass.
            // My regex already requires {2,5} so it handles the "must be at least 2 digits" part.
            // But wait, K10 is valid and it's 2 digits. K01 is valid and it's 2 digits.
            // K1 should be invalid.

            return true;
        }

        function submitManualEntry() {
            const input = document.getElementById('manual-pallet-id');
            const val = (input ? input.value : '').trim().toUpperCase();
            const errorDiv = document.getElementById('manual-error');

            if (validatePalletId(val)) {
                if (errorDiv) errorDiv.style.display = 'none';
                closeManualInput();
                onScanSuccess(val);
            } else {
                if (errorDiv) errorDiv.style.display = 'block';
            }
        }

        // --- Scanner Logic ---
        // iOS Safari quirks:
        // 1. facingMode: { exact: "environment" } có thể lỗi trên iOS cũ/iPad → dùng fallback chain với instance mới
        // 2. Phải tạo instance Html5Qrcode MỚI mỗi lần start (không tái dùng instance đã lỗi)
        // 3. fps thấp (10) ổn định hơn trên iOS
        // 4. Autofocus continuous giúp nhận mã nhanh hơn

        async function startScanner() {
            // Đảm bảo instance cũ đã được dọn sạch
            if (html5QrCode) {
                try { await html5QrCode.stop(); } catch (_) {}
                try { html5QrCode.clear(); } catch (_) {}
                html5QrCode = null;
            }

            const config = {
                fps: 10,                          // iOS ổn định hơn với fps thấp
                qrbox: { width: 220, height: 220 },
                aspectRatio: 1.0,
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true  // Dùng native BarcodeDetector API nếu có (nhanh hơn)
                }
            };

            // Thứ tự ưu tiên constraint cho iOS & Android:
            // [1] exact environment → [2] environment (không strict) → [3] getCameras() chọn camera cuối
            const cameraConstraints = [
                { facingMode: { exact: "environment" } },
                { facingMode: "environment" }
            ];

            for (let i = 0; i < cameraConstraints.length; i++) {
                try {
                    // Tạo instance MỚI cho mỗi lần thử — tránh trạng thái lỗi còn sót
                    html5QrCode = new Html5Qrcode("reader");
                    await html5QrCode.start(cameraConstraints[i], config, onScanSuccess);

                    // Bật continuous autofocus nếu thiết bị hỗ trợ (cải thiện nhận QR khi di chuyển)
                    try {
                        const track = html5QrCode.getRunningTrack();
                        if (track && track.getCapabilities) {
                            const caps = track.getCapabilities();
                            if (caps.focusMode && caps.focusMode.includes("continuous")) {
                                await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
                            }
                        }
                    } catch (_) { /* autofocus optional */ }

                    return; // Thành công → dừng vòng lặp
                } catch (err) {
                    console.warn(`Camera constraint [${i}] thất bại:`, err);
                    // Dọn instance lỗi trước khi thử lại
                    try { html5QrCode && html5QrCode.clear(); } catch (_) {}
                    html5QrCode = null;
                }
            }

            // Fallback cuối: getCameras() → chọn camera sau theo index hoặc label
            try {
                const devices = await Html5Qrcode.getCameras();
                if (!devices || devices.length === 0) {
                    alert("Không tìm thấy camera hoặc chưa cấp quyền!");
                    closeScanner();
                    return;
                }

                // Ưu tiên camera có label 'back', 'environment', 'rear'; nếu không có thì dùng camera cuối
                let cameraId = devices[devices.length - 1].id;
                for (const device of devices) {
                    const lbl = (device.label || '').toLowerCase();
                    if (lbl.includes('back') || lbl.includes('environment') || lbl.includes('rear')) {
                        cameraId = device.id;
                        break;
                    }
                }

                html5QrCode = new Html5Qrcode("reader");
                await html5QrCode.start(cameraId, config, onScanSuccess);

                try {
                    const track = html5QrCode.getRunningTrack();
                    if (track && track.getCapabilities) {
                        const caps = track.getCapabilities();
                        if (caps.focusMode && caps.focusMode.includes("continuous")) {
                            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
                        }
                    }
                } catch (_) {}

            } catch (finalErr) {
                console.error("Không thể khởi động camera:", finalErr);
                alert("Lỗi truy cập camera. Vui lòng cấp quyền camera và thử lại.");
                closeScanner();
            }
        }

        function onScanSuccess(decodedText) {
            if (isManualInputActive) return;
            if (navigator.vibrate) navigator.vibrate(100);

            if (scanContext === 'PALLET') {
                handlePalletScan(decodedText);
            } else {
                handleDestScan(decodedText);
            }
        }

        async function handlePalletScan(decodedText) {
            if (currentPalletId === decodedText) return;
            currentPalletId = decodedText;

            // Set Source Info (Demo values for now, could be dynamic)
            document.getElementById('conf-pallet-id').innerText = decodedText;
            document.getElementById('conf-source-loc').innerText = '---';
            document.getElementById('conf-source-zone').innerText = '---';

            // Dùng closeScanner() async để đảm bảo camera được giải phóng đúng cách trên iOS
            await closeScanner();
            document.getElementById('sheet-pallet-confirm').classList.add('active');
        }

        async function handleDestScan(decodedText) {
            // Check if scanned text corresponds to a valid location in allLocations
            let found = allLocations.find(loc => String(loc.id).toUpperCase() === String(decodedText).toUpperCase());

            if (found) {
                await closeScanner();
                selectLocation(found);
            } else {
                showToast("Vị trí không tồn tại trong danh sách!");
                await closeScanner();
            }
        }

        let allLocations = [];
        let selectedLocation = null;

        function openLocationPicker() {
            document.getElementById('sheet-location-picker').classList.add('active');
            if (allLocations.length === 0) {
                fetchLocations();
            } else {
                renderLocationList(allLocations);
            }
        }

        function closeLocationPicker() {
            document.getElementById('sheet-location-picker').classList.remove('active');
        }

        function closePalletConfirm() {
            document.getElementById('sheet-pallet-confirm').classList.remove('active');
            currentPalletId = null;
            selectedLocation = null;
            resetConfirmUI();
        }

        function resetConfirmUI() {
            document.getElementById('conf-dest-id').innerText = 'Chọn vị trí đích';
            document.getElementById('conf-dest-loc').innerText = '---';
            document.getElementById('conf-dest-zone').innerText = '---';
            document.getElementById('btn-final-confirm').disabled = true;
        }

        async function fetchLocations() {
            const list = document.getElementById('location-scroll-list');
            list.innerHTML = '<div class="loading-spinner">Đang tải danh sách...</div>';

            const { data, error } = await sb
                .from('locations')
                .select('*')
                .order('id');

            if (error) {
                list.innerHTML = `<div class="loading-spinner">Lỗi tải dữ liệu: ${error.message}</div>`;
                return;
            }

            allLocations = data;
            renderLocationList(data);
        }

        function renderLocationList(data) {
            const list = document.getElementById('location-scroll-list');
            list.innerHTML = '';

            if (!data || data.length === 0) {
                list.innerHTML = '<div class="loading-spinner">Không có dữ liệu</div>';
                return;
            }

            data.forEach(loc => {
                const div = document.createElement('div');
                div.className = 'location-item';
                div.onclick = () => selectLocation(loc);
                div.innerHTML = `
                    <div class="loc-id">${loc.id}</div>
                    <div class="loc-zone">${loc.name}</div>
                `;
                list.appendChild(div);
            });
        }

        function filterLocations() {
            const query = document.getElementById('loc-search').value.toLowerCase();
            const filtered = allLocations.filter(loc =>
                loc.id.toLowerCase().includes(query) ||
                loc.name.toLowerCase().includes(query)
            );
            renderLocationList(filtered);
        }

        function selectLocation(loc) {
            selectedLocation = loc;
            document.getElementById('conf-dest-id').innerText = loc.id;
            document.getElementById('conf-dest-loc').innerText = loc.id;
            document.getElementById('conf-dest-zone').innerText = loc.name;

            document.getElementById('btn-final-confirm').disabled = false;
            closeLocationPicker();
            document.getElementById('sheet-pallet-confirm').classList.add('active');
        }

        async function submitTransfer() {
            if (!currentPalletId || !selectedLocation) return;

            const btn = document.getElementById('btn-final-confirm');
            btn.innerText = "ĐANG XỬ LÝ...";
            btn.disabled = true;

            const data = {
                palletId: currentPalletId,
                destId: selectedLocation.id,
                destName: selectedLocation.name,
                user: currentUser ? currentUser.name : 'Unknown' // Send user name
            };

            const { data: res, error } = await sb.rpc('save_pallet_action', {
                p_pallet_id: data.palletId,
                p_dest_id: data.destId,
                p_dest_name: data.destName,
                p_user_name: data.user
            });

            btn.innerText = "Xác nhận";

            if (error) {
                btn.disabled = false;
                alert("Lỗi: " + error.message);
                return;
            }
            if (res.success) {
                showToast("Chuyển vị trí thành công!");
                closePalletConfirm();
                fetchHistory();
                showSlip(data);
            } else {
                btn.disabled = false;
                alert("Lỗi: " + res.message);
            }
        }

        function showSlip(data) {
            document.getElementById('slip-plt-id').innerText = data.palletId;
            document.getElementById('slip-dest').innerText = data.destName;
            document.getElementById('slip-time').innerText = new Date().toLocaleString('vi-VN');
            document.getElementById('modal-slip').style.display = 'flex';
        }

        function closeSlip() {
            document.getElementById('modal-slip').style.display = 'none';
            document.getElementById('page-scanner').classList.add('hidden');
            currentPalletId = null;
        }

        // --- Login Logic ---
        async function handleLogin() {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('btn-login');

            if (!email || !password) {
                showToast("Vui lòng nhập đầy đủ thông tin!");
                return;
            }

            btn.innerText = "ĐANG ĐĂNG NHẬP...";
            btn.disabled = true;

            const { data: res, error } = await sb.rpc('login', {
                p_email: email,
                p_password: password
            });

            btn.innerText = "ĐĂNG NHẬP";
            btn.disabled = false;

            if (error) {
                showToast("Lỗi hệ thống: " + error.message);
                return;
            }

            if (res.success) {
                // Set User Profile
                currentUser = res.user; // Store globally
                document.getElementById('user-name').innerText = `${res.user.name} - ${res.user.email.split('@')[0]}`;
                document.getElementById('user-dept').innerText = res.user.role;

                // Switch Page
                document.getElementById('page-login').classList.remove('active');
                document.getElementById('page-home').classList.add('active');
                showToast(`Chào mừng trở lại, ${res.user.name}!`);

                // Preload Locations and Transfer History
                fetchLocations();
                fetchHistory(true);
            } else {
                showToast(res.message);
            }
        }

        // Initialize and mobile iOS virtual keyboard handling
        window.onload = () => {
            // Lắng nghe sự kiện bàn phím ảo iOS (visualViewport) để tự động đẩy sheet nhập pallet lên trên bàn phím
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', () => {
                    const sheet = document.getElementById('sheet-manual');
                    if (sheet && sheet.classList.contains('active')) {
                        const keyboardHeight = window.innerHeight - window.visualViewport.height;
                        if (keyboardHeight > 80) {
                            sheet.style.bottom = `${keyboardHeight}px`;
                        } else {
                            sheet.style.bottom = '0px';
                        }
                    }
                });
            }

            // Cho phép nhấn Enter trên bàn phím ảo điện thoại để xác nhận
            const manualInput = document.getElementById('manual-pallet-id');
            if (manualInput) {
                manualInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        submitManualEntry();
                    }
                });
            }
        };
