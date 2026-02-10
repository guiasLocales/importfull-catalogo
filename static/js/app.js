document.addEventListener('DOMContentLoaded', function () {

    // Helper for category colors (inlined to avoid cache issues with utils.js)
    function getCategoryColor(category) {
        if (!category) return 'bg-gray-100 text-gray-800';
        const colors = [
            'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800',
            'bg-purple-100 text-purple-800', 'bg-orange-100 text-orange-800',
            'bg-pink-100 text-pink-800', 'bg-teal-100 text-teal-800',
            'bg-indigo-100 text-indigo-800', 'bg-cyan-100 text-cyan-800'
        ];
        let hash = 0;
        for (let i = 0; i < category.length; i++) {
            hash = category.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    const state = {
        products: [],
        page: 1,
        limit: 50,
        total: 0,
        search: '',
        sortBy: 'product_code',
        sortOrder: 'asc',
        selectedIds: new Set(),
        isLoading: false,
        filters: {
            category: '',
            brand: '',
            publish_event: '',
            stock_filter: ''
        }
    };


    // DOM Elements
    const elements = {
        container: document.getElementById('productsContainer'),
        loading: document.getElementById('loadingOverlay'),
        empty: document.getElementById('emptyState'),
        checkAll: document.getElementById('checkAll'),
        btnBulkPublish: document.getElementById('btnBulkPublish'),
        btnBulkUnpublish: document.getElementById('btnBulkUnpublish'),
        selectedCountPublish: document.getElementById('selectedCountPublish'),
        selectedCountUnpublish: document.getElementById('selectedCountUnpublish'),
        btnPrev: document.getElementById('btnPrev'),
        btnNext: document.getElementById('btnNext'),
        pageStart: document.getElementById('pageStart'),
        pageEnd: document.getElementById('pageEnd'),
        totalItems: document.getElementById('totalItems'),
        searchInput: document.getElementById('searchInput'),
        filterCategory: document.getElementById('filterCategory'),
        filterBrand: document.getElementById('filterBrand'),
        filterStatus: document.getElementById('filterStatus'),
        filterStock: document.getElementById('filterStock'),
        limitSelector: document.getElementById('limitSelector'),
        btnClearFilters: document.getElementById('btnClearFilters'),
        sortHeaders: document.querySelectorAll('.sortable'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        modalContent: document.getElementById('modalContent'),
        modalBody: document.getElementById('modalBody'),
        pageIndicator: document.getElementById('pageIndicator'),
        btnNewProduct: document.getElementById('btnNewProduct')
    };





    // --- Authenticated Fetch Helper ---
    function getAuthHeaders(extraHeaders = {}) {
        const token = localStorage.getItem('token');
        return {
            'Authorization': `Bearer ${token}`,
            ...extraHeaders
        };
    }

    async function authFetch(url, options = {}) {
        const token = localStorage.getItem('token');
        if (!token) {
            if (window.logout) window.logout();
            return new Response(null, { status: 401 });
        }

        // Merge auth header with any existing headers
        const mergedHeaders = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(url, {
            ...options,
            headers: mergedHeaders
        });

        if (response.status === 401) {
            if (window.logout) window.logout();
        }
        return response;
    }

    // --- API ---

    async function fetchProducts() {
        setLoading(true);
        try {
            const skip = (state.page - 1) * state.limit;

            let url = '/api/products/';
            let params = new URLSearchParams({
                skip: skip,
                limit: state.limit
            });

            // Search & Filters
            if (state.search && state.search.trim().length > 0) {
                params.append('q', state.search);
            }
            if (state.filters.category) params.append('category', state.filters.category);
            if (state.filters.brand) params.append('brand', state.filters.brand);
            if (state.filters.publish_event) {
                params.append('publish_event', state.filters.publish_event);
            }
            if (state.filters.stock_filter) {
                params.append('stock_filter', state.filters.stock_filter);
            }

            // Sorting
            if (state.sortBy) {
                params.append('sort_by', state.sortBy);
                params.append('sort_order', state.sortOrder);
            }

            const authToken = localStorage.getItem('token');
            if (!authToken) { setLoading(false); return; }

            const response = await fetch(`${url}?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (response.status === 401) { window.logout(); return; }
            if (!response.ok) throw new Error('Error fetching products');

            const data = await response.json();
            // Data loaded successfully


            if (Array.isArray(data)) {
                state.products = data;
                // Best guess total strictly for pagination UI feedback if backend doesn't return total
                // If less than limit returned, we know we are at end.
                if (data.length < state.limit) {
                    state.total = skip + data.length;
                } else {
                    state.total = skip + 1000; // Arbitrary "more"
                }
            } else {
                state.products = data.items || data;
                state.total = data.total || state.products.length;
            }

            renderProducts();
            updatePagination();
        } catch (error) {
            console.error(error);
            // alert('Error cargando productos');
        } finally {
            setLoading(false);
        }
    }

    async function deleteProductApi(id) {
        const response = await authFetch(`/api/products/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error deleting product');
        return true;
    }

    // --- Navigation Logic ---
    window.switchView = (viewName) => {
        const views = {
            inventory: document.getElementById('inventoryView'),
            mercadolibre: document.getElementById('meliView'),
            settings: document.getElementById('settingsView')
        };
        const navButtons = {
            inventory: document.getElementById('navInventory'),
            mercadolibre: document.getElementById('navMeli'),
            settings: document.getElementById('navSettings')
        };

        // Hide all views, deactivate all nav buttons
        Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
        Object.values(navButtons).forEach(b => {
            if (b) {
                b.classList.remove('bg-blue-50', 'text-blue-700', 'bg-yellow-50', 'text-yellow-700');
                b.classList.add('text-gray-700', 'hover:bg-gray-50');
            }
        });

        // Show selected view
        if (views[viewName]) views[viewName].classList.remove('hidden');

        // Highlight active nav button
        if (navButtons[viewName]) {
            navButtons[viewName].classList.remove('text-gray-700', 'hover:bg-gray-50');
            if (viewName === 'mercadolibre') {
                navButtons[viewName].classList.add('bg-yellow-50', 'text-yellow-700');
            } else {
                navButtons[viewName].classList.add('bg-blue-50', 'text-blue-700');
            }
        }

        // Load data for the view
        if (viewName === 'mercadolibre') {
            loadMeliProducts();
        }

        // Refresh icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // --- Render ---

    function renderProducts() {
        console.log("Rendering products, count:", state.products.length);
        elements.container.innerHTML = '';


        if (state.products.length === 0) {
            if (!state.isLoading) elements.empty.classList.remove('hidden');
            elements.container.innerHTML = '';
            return;
        } else {
            elements.empty.classList.add('hidden');
        }

        // Check filter active state for UI
        const hasFilters = state.search || state.filters.category || state.filters.brand || state.filters.publish_event || state.filters.stock_filter;
        if (hasFilters) {
            elements.btnClearFilters.classList.remove('hidden');
            elements.btnClearFilters.classList.add('flex');
        } else {
            elements.btnClearFilters.classList.add('hidden');
            elements.btnClearFilters.classList.remove('flex');
        }

        state.products.forEach(product => {
            // Desktop Row
            const isSelected = state.selectedIds.has(product.id.toString());
            const rowHtml = `
            <div class="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-100 hover:bg-blue-50/50 transition-colors items-center group relative bg-white">
                <div class="col-span-1 flex items-center justify-center">
                    <input type="checkbox" value="${product.id}" 
                        class="row-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                        ${isSelected ? 'checked' : ''}>
                </div>
                <div class="col-span-2 text-sm font-medium text-gray-900 truncate" title="${product.id}">
                    ${product.id}
                </div>
                <div class="col-span-4 flex items-center space-x-3 cursor-pointer" onclick="openProductDetail(${product.id})">
                    <div class="h-10 w-10 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                        <img src="${product.product_image_b_format_url || 'https://via.placeholder.com/40'}" 
                             alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate hover:text-blue-600 transition-colors" title="${product.product_name}">${product.product_name}</p>
                        <p class="text-xs truncate mt-0.5"><span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${getCategoryColor(product.product_type_path)}">${product.product_type_path || 'Sin categoría'}</span></p>
                    </div>
                </div>

                <div class="col-span-1 text-sm text-gray-600 truncate" title="${product.brand}">${product.brand || '-'}</div>
                <div class="col-span-1 text-sm text-gray-600">${product.stock || 0}</div>
                <div class="col-span-1">
                    <span class="text-sm font-semibold text-gray-900">${formatCurrency(product.price)}</span>
                </div>
                <div class="col-span-1 flex items-center justify-center text-center">
                    ${product.status && product.status.toLowerCase() === 'active'
                    ? '<img src="/static/img/meli-logo-light.png" alt="MercadoLibre" class="h-4 object-contain dark:hidden" title="Activo en MercadoLibre"><img src="/static/img/meli-logo-dark.png" alt="MercadoLibre" class="h-4 object-contain hidden dark:block" title="Activo en MercadoLibre">'
                    : ''}
                </div>
                <div class="col-span-1 flex items-center justify-end">
                    ${product.status && product.status.toLowerCase() === 'active'
                    ? `<button onclick="togglePublish(${product.id}, false, this)" class="px-2 py-1 text-[10px] font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded transition-colors whitespace-nowrap" title="Pausar">
                            Pausar
                       </button>`
                    : `<button onclick="togglePublish(${product.id}, true, this)" class="px-2 py-1 text-[10px] font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors whitespace-nowrap" title="Publicar">
                            Publicar
                       </button>`}
                </div>
            </div>
        `;


            // Mobile Card
            const cardHtml = `
            <div class="md:hidden bg-white p-4 mb-3 rounded-lg shadow-sm border border-gray-200 relative">
                <div class="absolute top-4 right-4">
                    ${product.status && product.status.toLowerCase() === 'active'
                    ? `<button onclick="togglePublish(${product.id}, false, this)" class="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded">Pausar</button>`
                    : `<button onclick="togglePublish(${product.id}, true, this)" class="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded">Publicar</button>`}
                </div>
                <div class="flex items-start space-x-3 mb-3">
                    <div class="flex items-center h-5">
                       <input type="checkbox" value="${product.id}" 
                        class="row-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        ${isSelected ? 'checked' : ''}>
                    </div>
                    <img src="${product.product_image_b_format_url || 'https://via.placeholder.com/80'}" class="h-16 w-16 mobile-img rounded-lg border border-gray-200" onclick="openProductDetail(${product.id})">
                    <div>
                        <h4 class="font-medium text-gray-900 text-sm line-clamp-1" onclick="openProductDetail(${product.id})">${product.product_name}</h4>
                        <p class="text-xs text-gray-500 mb-1">${product.product_code}</p>
                        <span class="text-sm font-bold text-blue-600">${formatCurrency(product.price)}</span>
                    </div>
                </div>
                <div class="flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
                    <div class="text-xs">
                        <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${getCategoryColor(product.product_type_path)}">${product.product_type_path || 'Sin Cat'}</span>
                    </div>
                    ${product.status && product.status.toLowerCase() === 'active'
                    ? '<img src="/static/img/meli-logo-light.png" alt="ML" class="h-3 object-contain dark:hidden" title="Activo en MercadoLibre"><img src="/static/img/meli-logo-dark.png" alt="ML" class="h-3 object-contain hidden dark:block" title="Activo en MercadoLibre">'
                    : ''}
                </div>
            </div>
        `;


            elements.container.insertAdjacentHTML('beforeend', rowHtml);
            elements.container.insertAdjacentHTML('beforeend', cardHtml);
        });

        lucide.createIcons();
        attachCheckboxListeners();
    }

    function updatePagination() {
        const start = (state.page - 1) * state.limit + 1;
        let end = start + state.products.length - 1;
        if (state.products.length === 0) end = 0;

        elements.pageStart.textContent = state.products.length > 0 ? start : 0;
        elements.pageEnd.textContent = end;

        // Update total text based on filters
        const hasFilters = state.search || state.filters.category || state.filters.brand || state.filters.publish_event || state.filters.stock_filter;
        if (hasFilters) {
            elements.totalItems.textContent = `${state.products.length} (Filtrados)`;
        } else {
            elements.totalItems.textContent = state.total > 1000 ? "1000+" : state.total;
        }

        if (elements.btnPrev) elements.btnPrev.disabled = state.page === 1;
        // Disable next if we received fewer than limit, implying end
        if (elements.btnNext) elements.btnNext.disabled = state.products.length < state.limit;
    }

    function setLoading(isLoading) {
        state.isLoading = isLoading;
        if (isLoading) {
            elements.loading.classList.remove('hidden');
        } else {
            elements.loading.classList.add('hidden');
        }
    }

    // --- Logic ---

    function attachCheckboxListeners() {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.value;
                if (e.target.checked) {
                    state.selectedIds.add(id);
                } else {
                    state.selectedIds.delete(id);
                }
                updateSelectionUI();
            });
        });
    }

    function updateSelectionUI() {
        const count = state.selectedIds.size;
        if (elements.selectedCountPublish) elements.selectedCountPublish.textContent = count;
        if (elements.selectedCountUnpublish) elements.selectedCountUnpublish.textContent = count;

        if (count > 0) {
            if (elements.btnBulkPublish) elements.btnBulkPublish.classList.remove('hidden');
            if (elements.btnBulkUnpublish) elements.btnBulkUnpublish.classList.remove('hidden');

            // Determine "Select All" state based on visible products matches
            const allVisibleSelected = state.products.length > 0 && state.products.every(p => state.selectedIds.has(p.id.toString()));
            const someVisibleSelected = state.products.some(p => state.selectedIds.has(p.id.toString()));

            elements.checkAll.indeterminate = someVisibleSelected && !allVisibleSelected;
            elements.checkAll.checked = allVisibleSelected;
        } else {
            if (elements.btnBulkPublish) elements.btnBulkPublish.classList.add('hidden');
            if (elements.btnBulkUnpublish) elements.btnBulkUnpublish.classList.add('hidden');
            elements.checkAll.indeterminate = false;
            elements.checkAll.checked = false;
        }
    }


    // Global function for publish toggle
    window.togglePublish = async (id, publish, buttonElement) => {
        const newStatus = publish ? 'Publicado' : 'Despublicado';
        const loadingText = publish ? 'Publicando...' : 'Pausando...';

        // Find the button that was clicked (use event.target or passed element)
        const button = buttonElement || event?.target;
        const originalText = button?.textContent?.trim();

        // Show loading state
        if (button) {
            button.disabled = true;
            button.textContent = loadingText;
            button.classList.add('opacity-50', 'cursor-wait');
        }

        try {
            const response = await authFetch(`/api/products/${id}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: newStatus === 'Publicado' ? 'publish' : 'pause' })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Error al actualizar');
            }

            // Refresh the list to show updated status
            fetchProducts();
        } catch (e) {
            console.error('Error updating publish status:', e);
            alert('Error al cambiar estado: ' + e.message);

            // Restore button on error
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
                button.classList.remove('opacity-50', 'cursor-wait');
            }
        }
    };



    // --- Product Detail View ---

    // Track current product index for navigation
    let currentDetailIndex = -1;

    async function openProductDetail(productId) {
        setLoading(true);

        // Find current index in products list
        currentDetailIndex = state.products.findIndex(p => p.id === productId);

        try {
            // Always fetch fresh data for detail view
            const [resProduct, resFiles] = await Promise.all([
                authFetch(`/api/products/${productId}`),
                authFetch(`/api/products/${productId}/files`).catch(() => ({ ok: false, json: () => [] }))
            ]);

            if (!resProduct.ok) throw new Error('Error fetching product details');
            const product = await resProduct.json();
            const files = resFiles.ok ? await resFiles.json() : [];

            // Determine if product is active based on MercadoLibre status
            const isActive = product.status && product.status.toLowerCase() === 'active';
            const hasPrev = currentDetailIndex > 0;
            const hasNext = currentDetailIndex < state.products.length - 1;

            const html = `
            <div class="flex flex-col md:flex-row h-full max-h-[80vh] relative">
                <!-- Close Button (Top-Right) -->
                <button onclick="closeModal()" 
                    class="absolute right-2 top-2 z-20 p-2 bg-white/90 hover:bg-gray-100 rounded-full shadow-lg transition-all border border-gray-200"
                    title="Cerrar">
                    <i data-lucide="x" class="h-5 w-5 text-gray-600"></i>
                </button>

                <!-- Navigation Arrows -->
                <button onclick="navigateProduct(-1)" id="btnPrevProduct"
                    class="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/80 rounded-full shadow hover:bg-gray-100 transition-colors ${hasPrev ? '' : 'opacity-30 cursor-not-allowed'}"
                    ${hasPrev ? '' : 'disabled'}>
                    <i data-lucide="chevron-left" class="h-4 w-4 text-gray-600"></i>
                </button>
                <button onclick="navigateProduct(1)" id="btnNextProduct"
                    class="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/80 rounded-full shadow hover:bg-gray-100 transition-colors ${hasNext ? '' : 'opacity-30 cursor-not-allowed'}"
                    ${hasNext ? '' : 'disabled'}>
                    <i data-lucide="chevron-right" class="h-4 w-4 text-gray-600"></i>
                </button>

                <!-- Left: Huge Image -->
                <div class="w-full md:w-1/2 bg-gray-100 flex flex-col p-4 min-h-[300px]">
                    <div class="flex-1 flex items-center justify-center mb-4">
                        <img id="main-product-image" 
                             src="${product.product_image_b_format_url || 'https://via.placeholder.com/400?text=No+Image'}" 
                             alt="${product.product_name}" 
                             class="max-h-[400px] max-w-full object-contain rounded-lg shadow-sm">
                    </div>

                    ${files && files.length > 0 ? `
                    <div class="w-full overflow-x-auto custom-scrollbar">
                        <div class="flex gap-2 pb-2">
                             <!-- Main Original Image Thumbnail -->
                             ${product.product_image_b_format_url ? `
                             <button onclick="document.getElementById('main-product-image').src='${product.product_image_b_format_url}'" 
                                     class="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border border-gray-300 hover:border-blue-500 transition-all">
                                <img src="${product.product_image_b_format_url}" class="w-full h-full object-cover">
                             </button>
                             ` : ''}

                            ${files.map(file => `
                                <button onclick="document.getElementById('main-product-image').src='${file.largeImageLink || file.thumbnailLink}'" 
                                        class="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border border-gray-300 hover:border-blue-500 transition-all relative group">
                                    <img src="${file.thumbnailLink}" alt="${file.name}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/64?text=Error'">
                                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>

                <!-- Right: Details -->
                <div class="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto custom-scrollbar flex flex-col">
                    <div class="mb-4 relative">
                        <div class="flex justify-between items-start">
                            <span class="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded ${getCategoryColor(product.product_type_path)}">
                                ${product.product_type_path || 'General'}
                            </span>
                            <button onclick="triggerProductUpdate(${product.id}, this)" 
                                    class="p-2 bg-sky-100 text-sky-700 hover:bg-sky-200 border border-sky-200 rounded-lg transition-all shadow-sm"
                                    title="Actualizar Datos">
                                <i data-lucide="rotate-cw" class="h-5 w-5"></i>
                            </button>
                        </div>
                        <h2 class="text-xl md:text-2xl font-bold text-gray-900 mt-2 leading-tight">
                            ${product.product_name}
                        </h2>
                        <p class="text-sm text-gray-500 mt-1">ID: ${product.id} <span class="mx-2 text-gray-300">|</span> <span class="text-xs">SKU: ${product.product_code}</span></p>
                    </div>

                    <div class="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                        <div>
                            <p class="text-sm text-gray-500 mb-1">Precio</p>
                            <span class="text-2xl font-bold text-gray-900">${formatCurrency(product.price)}</span>
                        </div>
                        <div class="text-right">
                            <p class="text-sm text-gray-500 mb-1">Stock</p>
                            <span class="text-xl font-bold text-gray-900">
                                ${product.stock || 0} u.
                            </span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3 text-sm mb-4">
                        <div>
                            <p class="text-gray-500">Marca</p>
                            <p class="font-medium text-gray-900">${product.brand || '-'}</p>
                        </div>
                        <div class="col-span-2">
                            <div class="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                <button onclick="toggleStatusDetails('${product.id}', this)" 
                                    class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 transition-colors">
                                    <div class="flex items-center gap-3">
                                        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado MercadoLibre</span>
                                        ${product.status
                    ? `<span class="${product.status.toLowerCase() === 'active' ? 'text-green-600 bg-green-50 border-green-200' : 'text-orange-600 bg-orange-50 border-orange-200'} px-2 py-0.5 rounded-full text-xs font-bold uppercase border">${product.status}</span>`
                    : (product.meli_id
                        ? '<span class="text-orange-500 bg-orange-50 border-orange-200 px-2 py-0.5 rounded-full text-xs font-medium border">Pendiente</span>'
                        : '<span class="text-gray-500 bg-gray-100 border-gray-300 px-2 py-0.5 rounded-full text-xs border">No Publicado</span>')
                }
                                    </div>
                                    ${(product.reason && product.reason !== 'None') || (product.remedy && product.remedy !== 'None') ? `
                                    <i data-lucide="chevron-down" class="h-4 w-4 text-gray-400 transition-transform duration-200"></i>
                                    ` : ''}
                                </button>
                                
                                ${(product.reason && product.reason !== 'None') || (product.remedy && product.remedy !== 'None') ? `
                                <div id="status-details-${product.id}" class="hidden border-t border-gray-200 p-3 bg-white space-y-2">
                                    ${(product.reason && product.reason !== 'None') ? `
                                    <div class="text-sm">
                                        <span class="text-gray-600 block mb-1 font-medium">⚠️ Problema:</span>
                                        <p class="text-red-700 bg-red-50 p-2 rounded border border-red-200 text-xs">
                                            ${product.reason}
                                        </p>
                                    </div>
                                    ` : ''}
                                    
                                    ${(product.remedy && product.remedy !== 'None') ? `
                                    <div class="text-sm">
                                        <span class="text-gray-600 block mb-1 font-medium">💡 Solución:</span>
                                        <p class="text-blue-700 bg-blue-50 p-2 rounded border border-blue-200 text-xs">
                                            ${product.remedy}
                                        </p>
                                    </div>
                                    ` : ''}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    ${product.meli_id ? `
                    <div class="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-700/30">
                        <div class="flex items-center gap-3">
                            <img src="/static/img/meli-logo-light.png" alt="MercadoLibre" class="h-6 object-contain dark:hidden">
                            <img src="/static/img/meli-logo-dark.png" alt="MercadoLibre" class="h-6 object-contain hidden dark:block">
                            <div>
                                <p class="text-xs text-gray-500 dark:text-gray-400">ID en MercadoLibre</p>
                                <a href="${product.permalink || 'https://www.mercadolibre.com.ar/p/' + product.meli_id}" 
                                   target="_blank" 
                                   class="text-blue-600 font-medium hover:underline dark:text-blue-400">
                                    ${product.meli_id}
                                </a>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    ${product.status || product.reason || product.remedy || product.meli_id ? `
                    <div class="mb-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
                         <button onclick="toggleMeliStatus('${product.id}', this)" 
                                class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                            <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">Estado MercadoLibre</h4>
                            <i data-lucide="chevron-down" class="h-4 w-4 text-gray-400 transition-transform duration-200 ${product.reason || product.remedy ? 'rotate-180' : ''}"></i>
                        </button>
                        
                        <div id="meli-status-content-${product.id}" class="${product.reason || product.remedy ? '' : 'hidden'} p-3 pt-0 space-y-2 border-t border-gray-100 dark:border-gray-700">
                             <div class="pt-2">
                                ${product.status ? `
                                <div class="flex justify-between items-center text-sm">
                                    <span class="text-gray-600 dark:text-gray-400">Estado:</span>
                                    <span class="font-medium ${product.status && product.status.toLowerCase() === 'active' ? 'text-green-600' : 'text-orange-600'} uppercase">${product.status}</span>
                                </div>` : (product.meli_id ? `
                                <div class="flex justify-between items-center text-sm">
                                    <span class="text-gray-600 dark:text-gray-400">Estado:</span>
                                    <span class="font-medium text-gray-500 dark:text-gray-400 italic">Esperando actualización...</span>
                                </div>` : '')}
                                
                                ${product.reason ? `
                                <div class="text-sm mt-2">
                                    <span class="text-gray-600 dark:text-gray-400 block mb-1">⚠️ Razón del problema:</span>
                                    <p class="text-red-700 bg-red-50 p-3 rounded border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 font-medium">
                                        ${product.reason}
                                    </p>
                                </div>` : ''}

                                ${product.remedy ? `
                                <div class="text-sm mt-2">
                                    <span class="text-gray-600 dark:text-gray-400 block mb-1">💡 Cómo solucionarlo:</span>
                                    <p class="text-blue-700 bg-blue-50 p-3 rounded border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300 font-medium">
                                        ${product.remedy}
                                    </p>
                                </div>` : ''}
                                
                                ${!product.reason && !product.remedy && product.meli_id ? `
                                <div class="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                                    Haz clic en el botón "Actualizar Datos" (arriba) para obtener el estado más reciente de MercadoLibre.
                                </div>` : ''}
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="mb-4">
                        <div id="drive-dropzone-${product.id}" 
                             class="relative p-4 rounded-lg border-2 border-dashed transition-all duration-200 group
                                    ${product.drive_url ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-gray-50 border-gray-300 dark:bg-gray-700/50 dark:border-gray-600 dark:hover:border-blue-500 dark:hover:bg-blue-900/10 hover:border-blue-400 hover:bg-blue-50'}"
                             ondragover="event.preventDefault(); this.classList.add('border-blue-500', 'bg-blue-100')"
                             ondragleave="this.classList.remove('border-blue-500', 'bg-blue-100')"
                             ondrop="handleDriveDrop(event, ${product.id})"
                             onclick="if(!event.target.closest('a, button')) document.getElementById('file-input-${product.id}').click()">
                            
                            <input type="file" id="file-input-${product.id}" class="hidden" onchange="handleDriveFileSelect(event, ${product.id})">
                            
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-4">
                                    <div class="p-2 rounded-full ${product.drive_url ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-300'}">
                                        <i data-lucide="${product.drive_url ? 'folder-check' : 'folder-up'}" class="h-6 w-6"></i>
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-semibold ${product.drive_url ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}">
                                            ${product.drive_url ? 'Carpeta de Drive' : 'Subir Fotos a Drive'}
                                        </h4>
                                        <p class="text-xs ${product.drive_url ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}">
                                            ${product.drive_url
                    ? 'Arrastra fotos aquí para subirlas'
                    : 'Arrastra fotos o haz click para crear carpeta'}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2">
                                    ${product.drive_url ? `
                                        <a href="${product.drive_url}" target="_blank" 
                                           class="p-2 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                                           title="Abrir en Drive"
                                           onclick="event.stopPropagation()">
                                            <i data-lucide="external-link" class="h-5 w-5"></i>
                                        </a>
                                    ` : `
                                        <span class="text-xs font-medium text-gray-400">Sin vincular</span>
                                    `}
                                </div>
                            </div>

                            <!-- Upload Overlay -->
                            <div id="upload-overlay-${product.id}" class="hidden absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                                <div class="text-center">
                                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                    <p class="text-sm font-medium text-blue-600">Subiendo...</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="mb-4 flex-1">
                        <h3 class="text-sm font-semibold text-gray-900 mb-1">Descripción</h3>
                        <p class="text-gray-600 text-sm leading-relaxed">${product.description || 'No hay descripción disponible.'}</p>
                    </div>

                    <div class="mt-auto pt-4 border-t border-gray-100 flex gap-3">
                        <button onclick="closeModal()" class="flex-1 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors border border-gray-500">
                            Cerrar
                        </button>
                        ${isActive
                    ? `<button onclick="togglePublishFromDetail(${product.id}, false)" class="flex-1 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium shadow-sm transition-colors">
                                Pausar
                               </button>`
                    : `<button onclick="togglePublishFromDetail(${product.id}, true)" class="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm transition-colors">
                                Publicar
                               </button>`}
                    </div>
                </div>
            </div>
            `;

            // Make modal wider for this view
            elements.modalContent.classList.remove('max-w-lg');
            elements.modalContent.classList.add('max-w-4xl');

            // Save original close function and add width reset
            const originalClose = window.closeModal;
            window.closeModal = () => {
                elements.modalContent.classList.remove('max-w-4xl');
                elements.modalContent.classList.add('max-w-lg');
                originalClose();
                window.closeModal = originalClose;
            };

            openModal(``, html);
            lucide.createIcons();

            // Remove any existing keyboard handler first (prevents stacking)
            if (window._productDetailKeyHandler) {
                document.removeEventListener('keydown', window._productDetailKeyHandler);
            }

            // Add keyboard navigation
            const handleKeyNav = (e) => {
                if (e.key === 'ArrowLeft') {
                    navigateProduct(-1);
                } else if (e.key === 'ArrowRight') {
                    navigateProduct(1);
                } else if (e.key === 'Escape') {
                    closeModal();
                }
            };
            document.addEventListener('keydown', handleKeyNav);

            // Store handler to remove on close
            window._productDetailKeyHandler = handleKeyNav;


        } catch (e) {
            console.error("Error fetching product details:", e);
            alert('Error al cargar los detalles del producto.');
        } finally {
            setLoading(false);
        }
    }

    // Navigate to previous/next product
    window.navigateProduct = (direction) => {
        const newIndex = currentDetailIndex + direction;
        if (newIndex >= 0 && newIndex < state.products.length) {
            const nextProduct = state.products[newIndex];
            openProductDetail(nextProduct.id);
        }
    };

    // Edit Drive URL from detail view
    window.editDriveUrl = async (productId, currentUrl) => {
        const newUrl = prompt("Ingresa la URL de la carpeta de Google Drive:", currentUrl);

        if (newUrl === null) return; // Cancelled

        try {
            const response = await authFetch(`/api/products/${productId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drive_url: newUrl })
            });

            if (!response.ok) throw new Error('Error al actualizar la URL en el servidor');

            // Update local state
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].drive_url = newUrl;
            }

            // Refresh the detail modal
            openProductDetail(productId);

        } catch (e) {
            console.error('Error updating drive URL:', e);
            alert('Error al guardar la URL de Drive: ' + e.message);
        }
    };

    // Drag and Drop Handlers
    window.handleDriveDrop = (e, productId) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove highlight styles
        const dropzone = e.currentTarget;
        dropzone.classList.remove('border-blue-500', 'bg-blue-100');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFileToDrive(files[0], productId);
        }
    };

    window.handleDriveFileSelect = (e, productId) => {
        const files = e.target.files;
        if (files.length > 0) {
            uploadFileToDrive(files[0], productId);
        }
    };

    async function uploadFileToDrive(file, productId) {
        const overlay = document.getElementById(`upload-overlay-${productId}`);
        const dropzone = document.getElementById(`drive-dropzone-${productId}`);

        if (overlay) overlay.classList.remove('hidden');
        if (dropzone) dropzone.classList.add('pointer-events-none'); // Disable interaction

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await authFetch(`/api/products/${productId}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Error en la subida');
            }

            const result = await response.json();

            // Success! Update local state with new Drive URL if created
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0 && result.drive_url) {
                state.products[productIndex].drive_url = result.drive_url;
            }

            alert('Foto subida correctamente a Drive!');
            openProductDetail(productId); // Refresh UI to show updated state/link

        } catch (e) {
            console.error('Upload error:', e);
            alert('Hubo un error al subir la foto: ' + e.message);
        } finally {
            if (overlay) overlay.classList.add('hidden');
            if (dropzone) dropzone.classList.remove('pointer-events-none');
            // Clear input
            const input = document.getElementById(`file-input-${productId}`);
            if (input) input.value = '';
        }
    }

    // Toggle publish from detail view and refresh the modal
    // Toggle publish from detail view and refresh the modal
    window.togglePublishFromDetail = async (productId, publish) => {
        const newStatus = publish ? 'Publicado' : 'Despublicado';
        const loadingText = publish ? 'Publicando...' : 'Pausando...';

        const button = event?.target?.closest('button');
        const originalText = button ? button.innerText : '';

        if (button) {
            button.disabled = true;
            button.innerText = loadingText;
            button.classList.add('opacity-50', 'cursor-wait');
        }

        try {
            const response = await authFetch(`/api/products/${productId}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: newStatus === 'Publicado' ? 'publish' : 'pause' })
            });
            if (!response.ok) throw new Error('Error updating product');

            // Update local state
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].publish_event = newStatus;
            }

            // Reopen the detail to show updated status
            openProductDetail(productId);
        } catch (e) {
            console.error('Error:', e);
            alert('Error al cambiar el estado');
            if (button) {
                button.disabled = false;
                button.innerText = originalText;
                button.classList.remove('opacity-50', 'cursor-wait');
            }
        }
    };


    // Trigger manual update notification
    window.triggerProductUpdate = async (productId, btn) => {
        const icon = btn.querySelector('i');
        // Start rotation animation
        if (icon) icon.classList.add('animate-spin');
        btn.disabled = true;

        try {
            const response = await authFetch(`/api/products/${productId}/notify`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Error en la notificación');

            // Show success briefly (maybe green check?)
            // For now just stop spinning
            setTimeout(() => {
                alert('Actualización enviada correctamente');
            }, 500);

        } catch (e) {
            console.error(e);
            alert('Error al enviar notificación de actualización');
        } finally {
            if (icon) icon.classList.remove('animate-spin');
            btn.disabled = false;
        }
    };

    window.toggleMeliStatus = (id, btn) => {
        const content = document.getElementById(`meli-status-content-${id}`);
        // Find the generic SVG icon since lucide replaces <i>
        const icon = btn.querySelector('svg') || btn.querySelector('i');

        if (content) content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
    };

    window.toggleStatusDetails = (id, btn) => {
        const content = document.getElementById(`status-details-${id}`);
        const icon = btn.querySelector('svg') || btn.querySelector('i');

        if (content) content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
    };

    window.openProductDetail = openProductDetail;


    async function fetchMetadata() {

        try {
            const [catRes, brandRes] = await Promise.all([
                authFetch('/api/categories'),
                authFetch('/api/brands')
            ]);

            if (catRes.ok) {
                const categories = await catRes.json();
                const catHtml = '<option value="">Todas las categorías</option>' +
                    categories.filter(c => c).map(c => `<option value="${c}">${c}</option>`).join('');
                elements.filterCategory.innerHTML = catHtml;
            }

            if (brandRes.ok) {
                const brands = await brandRes.json();
                const brandHtml = '<option value="">Todas las marcas</option>' +
                    brands.filter(b => b).map(b => `<option value="${b}">${b}</option>`).join('');
                elements.filterBrand.innerHTML = brandHtml;
            }
        } catch (e) {
            console.error("Error fetching metadata", e);
        }
    }


    // --- Modals ---

    function openModal(title, contentHtml) {
        elements.modalBody.innerHTML = contentHtml; // Simplistic content injection
        elements.modalBackdrop.classList.remove('hidden');
        // Simple animation delay
        setTimeout(() => {
            elements.modalBackdrop.classList.remove('opacity-0');
            elements.modalBackdrop.classList.add('opacity-100');
            elements.modalContent.classList.remove('scale-95');
            elements.modalContent.classList.add('scale-100');
        }, 10);
    }

    window.closeModal = () => {
        // Remove keyboard navigation handler if it exists
        if (window._productDetailKeyHandler) {
            document.removeEventListener('keydown', window._productDetailKeyHandler);
            window._productDetailKeyHandler = null;
        }

        elements.modalBackdrop.classList.remove('opacity-100');
        elements.modalBackdrop.classList.add('opacity-0');
        elements.modalContent.classList.remove('scale-100');
        elements.modalContent.classList.add('scale-95');
        setTimeout(() => {
            elements.modalBackdrop.classList.add('hidden');
        }, 300);
    };

    // --- Product Modal ---

    async function openProductModal(productId = null) {
        let product = {
            product_code: '',
            product_name: '',
            description: '',
            detail: '',
            price: '',
            stock: '',
            category: '',
            brand: '',
            product_type_path: '',
            product_use_stock: false,
            is_validated: false,
            product_image_b_format_url: ''
        };

        let title = 'Nuevo Producto';

        if (productId) {
            title = 'Editar Producto';
            try {
                setLoading(true);
                const res = await authFetch(`/api/products/${productId}`);
                if (!res.ok) throw new Error('Error fetching product');
                product = await res.json();
                // Ensure nulls are handled for inputs
                if (product.stock === null) product.stock = '';
                if (product.price === null) product.price = '';
            } catch (e) {
                console.error(e);
                alert('Error al cargar el producto');
                setLoading(false);
                return;
            } finally {
                setLoading(false);
            }
        }

        const html = `
        <form id="productForm" onsubmit="window.saveProduct(event, ${productId})" class="p-6">
            <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                
                <!-- Code & Name -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                        <input type="text" name="product_code" value="${product.product_code || ''}" 
                            ${productId ? 'disabled class="w-full rounded-lg border-gray-200 bg-gray-100 text-gray-500"' : 'required class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"'}
                            maxlength="100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                        <input type="text" name="product_name" value="${product.product_name || ''}" required 
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500" maxlength="255">
                    </div>
                </div>

                <!-- Price & Stock -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Precio *</label>
                        <input type="number" name="price" value="${product.price !== '' ? product.price : ''}" required min="0" step="0.01"
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="block text-sm font-medium text-gray-700">Stock</label>
                            <div class="flex items-center">
                                <input type="checkbox" id="useStock" name="product_use_stock" 
                                    ${product.product_use_stock ? 'checked' : ''} onchange="window.toggleStockInput(this)"
                                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                <label for="useStock" class="ml-2 block text-xs text-gray-500">Controlar Stock</label>
                            </div>
                        </div>
                        <input type="number" id="stockInput" name="stock" value="${product.stock !== '' ? product.stock : ''}" 
                            min="0" ${product.product_use_stock ? 'required' : 'disabled'}
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400">
                    </div>
                </div>

                <!-- Category & brand -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                        <input type="text" name="category" value="${product.category || ''}" required
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">marca *</label>
                        <input type="text" name="brand" value="${product.brand || ''}" required
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                </div>

                 <!-- Path -->
                <div>
                     <label class="block text-sm font-medium text-gray-700 mb-1">Ruta Tipo Producto</label>
                     <input type="text" name="product_type_path" value="${product.product_type_path || ''}" 
                         class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <!-- Description -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea name="description" rows="2" class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">${product.description || ''}</textarea>
                </div>
                
                 <!-- Detail -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Detalle</label>
                    <textarea name="detail" rows="2" class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">${product.detail || ''}</textarea>
                </div>

                <!-- Image URL -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">URL Imagen</label>
                    <div class="flex gap-4 items-start">
                        <input type="text" name="product_image_b_format_url" value="${product.product_image_b_format_url || ''}" id="imgUrlInput" oninput="window.updateImagePreview(this.value)"
                            class="flex-1 rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                        <div class="h-16 w-16 flex-shrink-0 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                            <img id="imgPreview" src="${product.product_image_b_format_url || 'https://via.placeholder.com/64?text=Img'}" class="h-full w-full object-cover">
                        </div>
                    </div>
                </div>

                 <!-- Validated Toggle -->
                <div class="flex items-center">
                    <input type="checkbox" id="isValidated" name="is_validated" ${product.is_validated ? 'checked' : ''}
                        class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                    <label for="isValidated" class="ml-2 block text-sm text-gray-900">Validado</label>
                </div>

            </div>

            <!-- Actions -->
            <div class="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button type="button" onclick="closeModal()" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                    Cancelar
                </button>
                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm hover:shadow transition-all">
                    Guardar
                </button>
            </div>
        </form>
    `;

        openModal(title, html);
    }

    // Global helpers for the modal
    window.toggleStockInput = (checkbox) => {
        const stockInput = document.getElementById('stockInput');
        if (checkbox.checked) {
            stockInput.disabled = false;
            stockInput.required = true;
            stockInput.classList.remove('bg-gray-100', 'text-gray-400');
        } else {
            stockInput.disabled = true;
            stockInput.required = false;
            stockInput.value = '';
            stockInput.classList.add('bg-gray-100', 'text-gray-400');
        }
    };

    window.updateImagePreview = (url) => {
        const img = document.getElementById('imgPreview');
        if (url && url.length > 5) {
            img.src = url;
        } else {
            img.src = 'https://via.placeholder.com/64?text=Img';
        }
    }

    window.saveProduct = async (e, id) => {
        e.preventDefault();
        const form = e.target;
        // Extract data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Fix types & Checkboxes (which are missing from FormData if unchecked)
        data.price = parseFloat(data.price);
        data.stock = data.stock ? parseInt(data.stock) : 0;

        // Explicitly check boolean fields
        data.product_use_stock = form.querySelector('[name="product_use_stock"]').checked;
        data.is_validated = form.querySelector('[name="is_validated"]').checked;

        // API Call
        try {
            const url = id ? `/api/products/${id}` : '/api/products/';
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errData = await response.json();
                // Try to extract useful error message
                const msg = errData.detail ? (typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail)) : 'Error al guardar';
                throw new Error(msg);
            }

            // Success
            closeModal();
            fetchProducts();

        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    };

    // --- Initialisation ---

    // btnNewProduct logic removed as requested


    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce((e) => {
            state.search = e.target.value;
            state.page = 1;
            fetchProducts();
        }, 500));
    }

    if (elements.btnPrev) {
        elements.btnPrev.addEventListener('click', () => {
            if (state.page > 1) {
                state.page--;
                fetchProducts();
            }
        });
    }

    if (elements.btnNext) {
        elements.btnNext.addEventListener('click', () => {
            state.page++;
            fetchProducts();
        });
    }

    if (elements.checkAll) {
        elements.checkAll.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const checkboxes = document.querySelectorAll('.row-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) state.selectedIds.add(cb.value);
                else state.selectedIds.delete(cb.value);
            });
            updateSelectionUI();
        });
    }

    // Bulk Publish button event
    if (elements.btnBulkPublish) {
        elements.btnBulkPublish.addEventListener('click', () => {
            if (state.selectedIds.size === 0) return;
            openModal('Publicar Productos', `
        <div class="p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-2">¿Publicar ${state.selectedIds.size} productos?</h3>
            <p class="text-gray-500 mb-6">Esta acción marcará todos los productos seleccionados como "Publicado".</p>
            <div class="flex justify-end space-x-3">
                <button onclick="closeModal()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">Cancelar</button>
                <button onclick="execBulkPublish(true)" class="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium shadow-sm">Publicar Todo</button>
            </div>
        </div>
    `);
        });
    }

    // Bulk Unpublish button event
    if (elements.btnBulkUnpublish) {
        elements.btnBulkUnpublish.addEventListener('click', () => {
            if (state.selectedIds.size === 0) return;
            openModal('Pausar Productos', `
        <div class="p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-2">¿Pausar ${state.selectedIds.size} productos?</h3>
            <p class="text-gray-500 mb-6">Esta acción marcará todos los productos seleccionados como "Pausado".</p>
            <div class="flex justify-end space-x-3">
                <button onclick="closeModal()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">Cancelar</button>
                <button onclick="execBulkPublish(false)" class="px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 font-medium shadow-sm">Pausar Todo</button>
            </div>
        </div>
    `);
        });
    }

    window.execBulkPublish = async (publish) => {
        const newStatus = publish ? 'Publicado' : 'Despublicado';
        try {
            const ids = Array.from(state.selectedIds);

            // Update database for all products
            const apiPromises = ids.map(id =>
                authFetch(`/api/products/${id}/publish`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: newStatus === 'Publicado' ? 'publish' : 'pause' })
                })
            );
            await Promise.all(apiPromises);

            state.selectedIds.clear();
            updateSelectionUI();
            closeModal();
            fetchProducts();
        } catch (e) {
            console.error('Error en publicación masiva:', e);
            alert('Error al cambiar estado');
        }
    };


    if (elements.filterCategory) {
        elements.filterCategory.addEventListener('change', (e) => {
            state.filters.category = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.filterBrand) {
        elements.filterBrand.addEventListener('change', (e) => {
            state.filters.brand = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.filterStatus) {
        elements.filterStatus.addEventListener('change', (e) => {
            state.filters.publish_event = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.filterStock) {
        elements.filterStock.addEventListener('change', (e) => {
            state.filters.stock_filter = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.limitSelector) {
        elements.limitSelector.addEventListener('change', (e) => {
            state.limit = parseInt(e.target.value, 10);
            state.page = 1;
            fetchProducts();
        });
    }

    // Sort column headers
    if (elements.sortHeaders && elements.sortHeaders.length > 0) {
        elements.sortHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                if (!sortField) return;

                // Toggle sort order if same field, otherwise reset to asc
                if (state.sortBy === sortField) {
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortBy = sortField;
                    state.sortOrder = 'asc';
                }

                // Update visual indicators
                updateSortIndicators();

                state.page = 1;
                fetchProducts();
            });
        });
    }

    function updateSortIndicators() {
        if (!elements.sortHeaders) return;
        elements.sortHeaders.forEach(header => {
            const icon = header.querySelector('[data-lucide]');
            if (!icon) return;

            const sortField = header.getAttribute('data-sort');
            if (sortField === state.sortBy) {
                // Active sort column
                icon.classList.remove('opacity-0');
                icon.classList.add('opacity-100', 'text-blue-600');
                icon.setAttribute('data-lucide', state.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down');
            } else {
                // Inactive sort column
                icon.classList.add('opacity-0');
                icon.classList.remove('opacity-100', 'text-blue-600');
                icon.setAttribute('data-lucide', 'arrow-up-down');
            }
        });
        // Re-render icons
        lucide.createIcons();
    }

    if (elements.btnClearFilters) {
        elements.btnClearFilters.addEventListener('click', () => {
            state.search = '';
            state.filters.category = '';
            state.filters.brand = '';
            state.filters.publish_event = '';
            state.filters.stock_filter = '';
            state.page = 1;
            state.selectedIds.clear();
            updateSelectionUI();

            if (elements.searchInput) elements.searchInput.value = '';
            if (elements.filterCategory) elements.filterCategory.value = '';
            if (elements.filterBrand) elements.filterBrand.value = '';
            if (elements.filterStatus) elements.filterStatus.value = '';
            if (elements.filterStock) elements.filterStock.value = '';

            fetchProducts();
        });
    }


    // --- Auth Logic ---
    const loginView = document.getElementById('loginView');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    function checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            loginView.classList.remove('hidden');
        } else {
            loginView.classList.add('hidden');
            fetchUserMe();
        }
    }

    window.logout = () => {
        localStorage.removeItem('token');
        checkAuth();
    };

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const loginBtn = loginForm.querySelector('button[type="submit"]');

            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            try {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Ingresando...';

                const response = await fetch('/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Login failed');
                }

                const data = await response.json();
                localStorage.setItem('token', data.access_token);
                loginView.classList.add('hidden');
                loginError.classList.add('hidden');
                loginForm.reset();

                fetchProducts();
                fetchUserMe();

            } catch (error) {
                loginError.classList.remove('hidden');
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Ingresar';
            }
        });
    }

    // --- Settings Logic ---
    async function fetchUserMe() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await authFetch('/users/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const user = await response.json();

                const userNameEl = document.getElementById('userName');
                if (userNameEl) userNameEl.textContent = user.username;

                const avatar = document.getElementById('userAvatar');
                if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();

                // Settings inputs
                const settingsUsername = document.getElementById('settingsUsername');
                if (settingsUsername) settingsUsername.value = user.username;

                // Logo
                if (user.logo_url) {
                    updateAppLogo(user.logo_url);
                    const settingsPreview = document.getElementById('settingsLogoPreview');
                    const settingsPlaceholder = document.getElementById('settingsLogoPlaceholder');
                    if (settingsPreview) {
                        settingsPreview.src = user.logo_url;
                        settingsPreview.classList.remove('hidden');
                    }
                    if (settingsPlaceholder) settingsPlaceholder.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            if (error.status === 401) logout();
        }
    }

    function updateAppLogo(url) {
        const appLogoIcon = document.getElementById('appLogoIcon');
        if (appLogoIcon) {
            appLogoIcon.innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
            appLogoIcon.classList.remove('bg-blue-600', 'text-white'); // Remove default style
        }
    }

    const btnSaveCredentials = document.getElementById('btnSaveCredentials');
    if (btnSaveCredentials) {
        btnSaveCredentials.addEventListener('click', async () => {
            const username = document.getElementById('settingsUsername').value;
            const password = document.getElementById('settingsPassword').value;
            const token = localStorage.getItem('token');

            if (!username) return alert('El usuario es requerido');

            const payload = { username };
            if (password) payload.password = password;

            try {
                const response = await authFetch('/users/me', {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert('Credenciales actualizadas correctamente');
                    fetchUserMe();
                } else {
                    alert('Error al actualizar credenciales');
                }
            } catch (e) {
                console.error(e);
                alert('Error de conexión');
            }
        });
    }

    const settingsLogoInput = document.getElementById('settingsLogoInput');
    if (settingsLogoInput) {
        settingsLogoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/upload-logo', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    updateAppLogo(data.logo_url);
                    fetchUserMe();
                } else {
                    alert('Error al subir logo');
                }
            } catch (e) {
                console.error(e);
                alert('Error de conexión');
            }
        });
    }

    checkAuth();



    // --- Theme Logic ---
    const themeToggleBtn = document.getElementById('themeToggle');

    function initTheme() {
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            updateThemeIcon(true);
        } else {
            document.documentElement.classList.remove('dark');
            updateThemeIcon(false);
        }
    }

    function toggleTheme() {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.theme = 'light';
            updateThemeIcon(false);
        } else {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
            updateThemeIcon(true);
        }
        // Update sidebar logo to match new theme
        if (typeof updateSidebarLogo === 'function') {
            setTimeout(updateSidebarLogo, 50);
        }
    }

    function updateThemeIcon(isDark) {
        if (!themeToggleBtn) return;
        themeToggleBtn.innerHTML = isDark
            ? `<i data-lucide="sun" class="h-5 w-5 mr-3"></i> Modo Claro`
            : `<i data-lucide="moon" class="h-5 w-5 mr-3"></i> Modo Oscuro`;
        lucide.createIcons();
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    initTheme();

    // --- Logo Management ---

    // Load saved logos from localStorage on page load
    function loadSavedLogos() {
        const lightLogo = localStorage.getItem('logoLight');
        const darkLogo = localStorage.getItem('logoDark');

        const settingsLogoLightPreview = document.getElementById('settingsLogoLightPreview');
        const settingsLogoDarkPreview = document.getElementById('settingsLogoDarkPreview');
        const settingsLogoLightPlaceholder = document.getElementById('settingsLogoLightPlaceholder');
        const settingsLogoDarkPlaceholder = document.getElementById('settingsLogoDarkPlaceholder');

        // Update settings previews
        if (lightLogo) {
            if (settingsLogoLightPreview) {
                settingsLogoLightPreview.src = lightLogo;
                settingsLogoLightPreview.classList.remove('hidden');
            }
            if (settingsLogoLightPlaceholder) {
                settingsLogoLightPlaceholder.classList.add('hidden');
            }
        }

        if (darkLogo) {
            if (settingsLogoDarkPreview) {
                settingsLogoDarkPreview.src = darkLogo;
                settingsLogoDarkPreview.classList.remove('hidden');
            }
            if (settingsLogoDarkPlaceholder) {
                settingsLogoDarkPlaceholder.classList.add('hidden');
            }
        }

        // Update sidebar logo using the centralized function
        updateSidebarLogo();

        console.log('Logos loaded - Light:', !!lightLogo, 'Dark:', !!darkLogo);
    }

    // Update sidebar logo based on current theme
    function updateSidebarLogo() {
        const lightLogo = localStorage.getItem('logoLight');
        const darkLogo = localStorage.getItem('logoDark');

        const sidebarLogoLight = document.getElementById('sidebarLogoLight');
        const sidebarLogoDark = document.getElementById('sidebarLogoDark');
        const defaultLogoArea = document.getElementById('defaultLogoArea');

        const isDarkMode = document.documentElement.classList.contains('dark');

        console.log('updateSidebarLogo called:', {
            lightLogo: !!lightLogo,
            darkLogo: !!darkLogo,
            sidebarLogoLight: !!sidebarLogoLight,
            sidebarLogoDark: !!sidebarLogoDark,
            defaultLogoArea: !!defaultLogoArea,
            isDarkMode
        });

        // Hide all first
        if (sidebarLogoLight) sidebarLogoLight.classList.add('hidden');
        if (sidebarLogoDark) sidebarLogoDark.classList.add('hidden');
        if (defaultLogoArea) defaultLogoArea.classList.remove('hidden');

        if (isDarkMode) {
            if (darkLogo && sidebarLogoDark) {
                sidebarLogoDark.src = darkLogo;
                sidebarLogoDark.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing dark logo');
            } else if (lightLogo && sidebarLogoLight) {
                sidebarLogoLight.src = lightLogo;
                sidebarLogoLight.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing light logo (dark mode fallback)');
            }
        } else {
            if (lightLogo && sidebarLogoLight) {
                sidebarLogoLight.src = lightLogo;
                sidebarLogoLight.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing light logo');
            } else if (darkLogo && sidebarLogoDark) {
                sidebarLogoDark.src = darkLogo;
                sidebarLogoDark.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing dark logo (light mode fallback)');
            }
        }
    }

    // Handle logo file upload
    function handleLogoUpload(inputId, previewId, placeholderId, storageKey) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);

        if (!input) return;

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;

                // Save to localStorage
                localStorage.setItem(storageKey, dataUrl);

                // Update preview
                if (preview) {
                    preview.src = dataUrl;
                    preview.classList.remove('hidden');
                }
                if (placeholder) {
                    placeholder.classList.add('hidden');
                }

                // Update sidebar
                updateSidebarLogo();
            };
            reader.readAsDataURL(file);
        });
    }

    // Initialize logo handlers
    handleLogoUpload('settingsLogoLightInput', 'settingsLogoLightPreview', 'settingsLogoLightPlaceholder', 'logoLight');
    handleLogoUpload('settingsLogoDarkInput', 'settingsLogoDarkPreview', 'settingsLogoDarkPlaceholder', 'logoDark');

    // Load saved logos on page load
    loadSavedLogos();

    // === MercadoLibre View Logic ===
    let meliDebounceTimer = null;

    async function loadMeliProducts() {
        const loading = document.getElementById('meliLoadingOverlay');
        const tableBody = document.getElementById('meliTableBody');
        const emptyState = document.getElementById('meliEmptyState');

        if (!tableBody) return;

        if (loading) loading.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        try {
            const searchInput = document.getElementById('meliSearchInput');
            const statusFilter = document.getElementById('meliStatusFilter');

            let params = new URLSearchParams();
            if (searchInput && searchInput.value.trim()) params.append('q', searchInput.value.trim());
            if (statusFilter && statusFilter.value) params.append('status', statusFilter.value);

            const response = await authFetch(`/api/products/meli?${params.toString()}`);
            if (!response.ok) throw new Error('Error loading ML products');

            const data = await response.json();
            const products = data.products || [];

            // Update counters
            const activeCount = document.getElementById('meliActiveCount');
            const pausedCount = document.getElementById('meliPausedCount');
            const totalCount = document.getElementById('meliTotalCount');
            const showingCount = document.getElementById('meliShowing');

            if (activeCount) activeCount.textContent = data.active_count || 0;
            if (pausedCount) pausedCount.textContent = data.paused_count || 0;
            if (totalCount) totalCount.textContent = data.total || 0;
            if (showingCount) showingCount.textContent = products.length;

            // Render table
            if (products.length === 0) {
                tableBody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
            } else {
                tableBody.innerHTML = products.map(p => {
                    const statusClass = getMLStatusClass(p.status);
                    const statusLabel = getMLStatusLabel(p.status);
                    const price = p.price ? `$ ${Number(p.price).toLocaleString('es-AR')}` : '-';
                    const stockBadge = getStockBadge(p.stock);
                    const imgSrc = p.product_image_b_format_url || '';
                    const imgHtml = imgSrc
                        ? `<img src="${imgSrc}" alt="" class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" onerror="this.style.display='none'">`
                        : `<div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`;

                    const permalink = p.permalink;
                    const linkHtml = permalink
                        ? `<a href="${permalink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-xs font-medium">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            Ver
                           </a>`
                        : `<span class="text-gray-400 text-xs">Sin link</span>`;

                    return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onclick="openProductDetail(${p.id})">
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                                ${imgHtml}
                                <div class="min-w-0">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[250px]">${p.product_name || 'Sin nombre'}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">${p.product_code || ''} · ${p.brand || ''}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-4 py-3">
                            <span class="text-sm font-mono text-gray-600 dark:text-gray-400">${p.meli_id || '-'}</span>
                        </td>
                        <td class="px-4 py-3">
                            <span class="${statusClass}">${statusLabel}</span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">${price}</span>
                        </td>
                        <td class="px-4 py-3 text-center">${stockBadge}</td>
                        <td class="px-4 py-3 text-center" onclick="event.stopPropagation()">${linkHtml}</td>
                    </tr>`;
                }).join('');
            }
        } catch (e) {
            console.error('Error loading MercadoLibre products:', e);
            tableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">Error al cargar productos de MercadoLibre</td></tr>`;
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }

    function getMLStatusClass(status) {
        const s = (status || '').toLowerCase();
        if (s === 'active') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
        if (s === 'paused') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400';
        if (s === 'closed') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
        if (s === 'under_review') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400';
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }

    function getMLStatusLabel(status) {
        const s = (status || '').toLowerCase();
        const dot = '<span class="w-1.5 h-1.5 rounded-full"></span>';
        if (s === 'active') return `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Activo`;
        if (s === 'paused') return `<span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Pausado`;
        if (s === 'closed') return `<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Cerrado`;
        if (s === 'under_review') return `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> En revisión`;
        return `<span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span> ${status || 'Desconocido'}`;
    }

    function getStockBadge(stock) {
        if (stock === null || stock === undefined) return '<span class="text-gray-400 text-sm">-</span>';
        if (stock === 0) return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Sin stock</span>';
        if (stock <= 3) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">${stock}</span>`;
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">${stock}</span>`;
    }

    // MercadoLibre event listeners
    const meliSearchInput = document.getElementById('meliSearchInput');
    const meliStatusFilter = document.getElementById('meliStatusFilter');

    if (meliSearchInput) {
        meliSearchInput.addEventListener('input', () => {
            clearTimeout(meliDebounceTimer);
            meliDebounceTimer = setTimeout(loadMeliProducts, 300);
        });
    }

    if (meliStatusFilter) {
        meliStatusFilter.addEventListener('change', loadMeliProducts);
    }

    // === End MercadoLibre ===

    // Initial load - check auth FIRST, only load data if authenticated
    checkAuth();

    const token = localStorage.getItem('token');
    if (token) {
        fetchProducts();
    }

}); // End DOMContentLoaded

