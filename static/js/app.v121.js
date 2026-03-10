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

    // Helper for currency formatting (inlined from utils.js)
    function formatCurrency(value) {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
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
        console.log('[DEBUG] fetchProducts called');
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
            console.log('[DEBUG] Token exists:', !!authToken);
            if (!authToken) { setLoading(false); return; }

            const fullUrl = `${url}?${params.toString()}`;
            console.log('[DEBUG] Fetching:', fullUrl);
            const response = await fetch(fullUrl, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            console.log('[DEBUG] Response status:', response.status);
            if (response.status === 401) { window.logout(); return; }
            if (!response.ok) throw new Error('Error fetching products: ' + response.status);

            const data = await response.json();
            console.log('[DEBUG] Data type:', typeof data, 'isArray:', Array.isArray(data), 'length:', Array.isArray(data) ? data.length : 'N/A');


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

            console.log('[DEBUG] state.products.length:', state.products.length);
            renderProducts();
            updatePagination();
        } catch (error) {
            console.error('[DEBUG] fetchProducts ERROR:', error);
            // Show error on screen for debugging
            if (elements.container) {
                elements.container.innerHTML = `<div class="p-8 text-center text-red-600">Error: ${error.message}</div>`;
            }
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
            competence: document.getElementById('competenceView'),
            settings: document.getElementById('settingsView'),
            prompts: document.getElementById('promptsView')
        };
        const navButtons = {
            inventory: document.getElementById('navInventory'),
            mercadolibre: document.getElementById('navMeli'),
            competence: document.getElementById('navCompetence'),
            settings: document.getElementById('navSettings'),
            prompts: document.getElementById('navPrompts')
        };

        // Hide all views, deactivate all nav buttons
        Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
        Object.values(navButtons).forEach(b => {
            if (b) {
                b.classList.remove('bg-blue-50', 'text-blue-700', 'bg-yellow-50', 'text-yellow-700', 'bg-purple-50', 'text-purple-700');
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
            } else if (viewName === 'competence') {
                navButtons[viewName].classList.add('bg-purple-50', 'text-purple-700');
            } else {
                navButtons[viewName].classList.add('bg-blue-50', 'text-blue-700');
            }
        }


        // Load data for the view
        if (viewName === 'mercadolibre') {
            loadMeliProducts();
        }
        if (viewName === 'competence') {
            loadCompetenceData();
        }
        if (viewName === 'prompts') {
            loadPrompts();
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
                    ${(() => {
                    const s = product.status ? product.status.toLowerCase() : '';
                    const meliLink = product.permalink || '';
                    if (product.meli_id && s !== 'pausando' && s !== 'actualizando' && s !== 'en proceso') return `<a href="${meliLink}" target="_blank" rel="noopener" class="flex flex-col items-center gap-0.5 group/meli" title="Ver en MercadoLibre: ${product.meli_id}" onclick="event.stopPropagation()"><img src="/static/img/meli-logo-light.png" alt="ML" class="h-8 object-contain dark:hidden"><img src="/static/img/meli-logo-dark.png" alt="ML" class="h-8 object-contain hidden dark:block"><span class="text-[9px] font-mono text-gray-400 group-hover/meli:text-blue-500 transition-colors">${product.meli_id}</span></a>`;
                    if (s === 'en proceso') return '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded-full animate-pulse border border-blue-200">En Proceso</span>';
                    if (s === 'pausando') return '<span class="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold uppercase rounded-full animate-pulse border border-orange-200">Pausando</span>';
                    if (s === 'actualizando') return '<span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded-full animate-pulse border border-green-200">Actualizando</span>';
                    if (product.meli_id) return `<a href="${meliLink}" target="_blank" rel="noopener" class="flex flex-col items-center gap-0.5 group/meli" title="Ver en MercadoLibre: ${product.meli_id}" onclick="event.stopPropagation()"><img src="/static/img/meli-logo-light.png" alt="ML" class="h-8 object-contain dark:hidden"><img src="/static/img/meli-logo-dark.png" alt="ML" class="h-8 object-contain hidden dark:block"><span class="text-[9px] font-mono text-gray-400 group-hover/meli:text-blue-500 transition-colors">${product.meli_id}</span></a>`;
                    return '<span class="text-xs text-gray-400 font-medium">No Publicado</span>';
                })()}
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
                    ${(() => {
                    if (product.meli_id) return `<span class="text-[9px] font-mono text-green-600 font-bold">${product.meli_id}</span>`;
                    const s = product.status ? product.status.toLowerCase() : '';
                    if (s === 'en proceso') return '<span class="text-xs font-bold text-blue-600 animate-pulse">En Proceso</span>';
                    return '';
                })()}
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
        const action = publish ? 'publish' : 'pause';
        const loadingText = publish ? 'Publicando...' : 'Pausando...';

        // Find the button that was clicked (use event.target or passed element)
        const button = buttonElement || event?.target;
        const originalText = button ? button.textContent : '';

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
                body: JSON.stringify({ action: action })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Error al actualizar');
            }

            // Success: Update local state with intermediate status and re-render
            const newStatus = publish ? 'en proceso' : 'pausando';
            const productIndex = state.products.findIndex(p => p.id === id);
            if (productIndex >= 0) {
                state.products[productIndex].status = newStatus;
            }
            renderProducts();

            // Note: We do NOT call fetchProducts() here to avoid overwriting "En Proceso" 
            // with the old DB status before the webhook finishes.

        } catch (e) {
            console.error('Error updating publish status:', e);
            alert('Error al cambiar estado: ' + e.message);
        } finally {
            // Restore button state
            if (button) {
                button.disabled = false;
                button.textContent = originalText; // Or flip it? For now restore original, renderProducts will likely recreate the button anyway.
                button.classList.remove('opacity-50', 'cursor-wait');
            }
        }
    };



    // --- Product Detail View ---

    // Track current product index for navigation
    let currentDetailIndex = -1;

    // Debounced version of save for auto-save
    const debouncedSave = (id) => {
        // We use a simple timer here because the global debounce function might not be easily accessible 
        // depending on closure scope, so we implement a quick one or ensure we can call it.
        if (window._autoSaveTimer) clearTimeout(window._autoSaveTimer);

        const statusEl = document.getElementById('auto-save-status');
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-gray-400 italic text-xs">Cambios pendientes...</span>';
        }

        window._autoSaveTimer = setTimeout(async () => {
            if (statusEl) {
                statusEl.innerHTML = '<span class="flex items-center gap-1.5 text-blue-600 animate-pulse text-xs font-medium"><div class="h-2 w-2 bg-blue-600 rounded-full"></div> Guardando...</span>';
            }

            const updates = {};
            const nameEl = document.getElementById('edit_product_name_meli');
            if (nameEl) updates.product_name_meli = nameEl.value;
            const linkEl = document.getElementById('edit_catalog_link');
            if (linkEl) updates.catalog_link = linkEl.value;
            const descEl = document.getElementById('edit_description');
            if (descEl) updates.description = descEl.value;
            const priceEl = document.getElementById('edit_price');
            if (priceEl && priceEl.value !== "") updates.price = parseFloat(priceEl.value);

            try {
                const response = await authFetch(`/api/products/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });

                if (!response.ok) throw new Error('Error al guardar');

                // Update local state
                const productIndex = state.products.findIndex(p => p.id === id);
                if (productIndex >= 0) {
                    state.products[productIndex] = { ...state.products[productIndex], ...updates };
                }

                if (statusEl) {
                    statusEl.innerHTML = '<span class="text-green-600 flex items-center gap-1 text-xs font-bold"><i data-lucide="check" class="h-3 w-3"></i> Guardado</span>';
                    if (window.lucide) lucide.createIcons();
                    setTimeout(() => {
                        if (statusEl && statusEl.innerText.includes('Guardado')) {
                            statusEl.innerHTML = '';
                        }
                    }, 2000);
                }
            } catch (e) {
                console.error(e);
                if (statusEl) {
                    statusEl.innerHTML = '<span class="text-red-600 text-xs font-medium">Error al guardar</span>';
                }
            }
        }, 800);
    };

    window.triggerAutoSave = (id) => {
        debouncedSave(id);
    };

    window.saveProductDetails = async (id) => {
        // Fallback for manual trigger if ever needed, but now redirected to auto-save logic
        debouncedSave(id);
    };

    // Refresh product detail without closing the modal
    window.refreshProductDetail = async function (productId) {
        try {
            const response = await authFetch(`/api/products/${productId}`);
            if (!response.ok) throw new Error('Error al cargar producto');
            const updatedProduct = await response.json();

            // Update local state
            const idx = state.products.findIndex(p => p.id === productId);
            if (idx >= 0) state.products[idx] = updatedProduct;

            // Re-open the detail with fresh data
            await openProductDetail(productId);
        } catch (e) {
            console.error(e);
            alert('Error al refrescar: ' + e.message);
        }
    };

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
            <div class="flex flex-col md:flex-row h-full max-h-[90vh] relative">
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
                <div class="w-full md:w-5/12 bg-gray-100 flex flex-col p-4 border-r border-gray-200">
                    <div class="flex-1 flex items-center justify-center mb-4 relative min-h-[200px] md:min-h-[300px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <img id="main-product-image" 
                             src="${product.product_image_b_format_url || (files && files.length > 0 ? (files[0].thumbnailLink || files[0].webContentLink) : 'https://via.placeholder.com/400?text=Sin+Imagen')}" 
                             alt="${product.product_name}" 
                             referrerpolicy="no-referrer"
                             onerror="this.onerror=null;this.src='https://via.placeholder.com/400?text=Error+Carga';this.classList.add('opacity-50');"
                             class="max-h-[300px] md:max-h-[500px] max-w-full object-contain transition-opacity duration-300">
                    </div>

                    ${files && files.length > 0 ? `
                    <div class="w-full overflow-x-auto custom-scrollbar pt-2">
                        <div class="flex gap-2">
                             <!-- Main Original Image Thumbnail -->
                             ${product.product_image_b_format_url ? `
                             <button onclick="document.getElementById('main-product-image').src='${product.product_image_b_format_url}'" 
                                     class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 transition-all bg-white shadow-sm">
                                <img src="${product.product_image_b_format_url}" class="w-full h-full object-cover">
                             </button>
                             ` : ''}

                            ${files.map(file => `
                                <button onclick="document.getElementById('main-product-image').src='${file.largeImageLink || file.thumbnailLink}'" 
                                        class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 transition-all relative group bg-white shadow-sm">
                                    <img src="${file.thumbnailLink}" alt="${file.name}" class="w-full h-full object-cover" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTA5MDkwIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0yMSAxNXV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNG0xNC0ybC0tNHYxMm00LQhMNyA5Ii8+PC9zdmc+';this.style.padding='10px';">
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>

                <!-- Right: Details -->
                <div class="w-full md:w-7/12 p-6 md:p-8 overflow-y-auto custom-scrollbar flex flex-col bg-white">
                    <div class="mb-5 border-b border-gray-100 pb-5">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${getCategoryColor(product.product_type_path)}">
                                ${product.product_type_path || 'General'}
                            </span>
                            <div class="flex gap-2">
                                <button onclick="refreshProductDetail(${product.id})" 
                                        class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Refrescar datos">
                                    <i data-lucide="refresh-cw" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </div>
                        
                        <h2 class="text-xl font-bold text-gray-900 leading-tight mb-1">
                            ${product.product_name}
                        </h2>
                        <div class="flex items-center gap-3 text-sm text-gray-500">
                             <span>ID: ${product.id}</span>
                             <span class="text-gray-300">|</span>
                             <span>SKU: ${product.product_code}</span>
                        </div>
                    </div>

                    <!-- Editable Fields Section -->
                    <div class="space-y-4 mb-6">
                        
                        <!-- Meli Name -->
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                Nombre en MercadoLibre
                            </label>
                            <div class="flex gap-2">
                                <input type="text" id="edit_product_name_meli" 
                                   value="${product.product_name_meli || ''}" oninput="triggerAutoSave(${product.id})" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm placeholder-gray-400" 
                                   placeholder="Nombre optimizado para publicación...">
                                <button id="btn-ai-product_name_meli" onclick="triggerAIPrePublish(${product.id}, 'product_name_meli')" 
                                    class="px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors shadow-sm"
                                    title="Generar con AI">
                                    <i data-lucide="sparkles" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </div>

                         <!-- Catalog Link -->
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                Link de Catálogo / Proveedor
                            </label>
                            <div class="flex gap-2">
                                <div class="relative flex-1">
                                    <input type="text" id="edit_catalog_link" 
                                           value="${product.catalog_link || ''}" oninput="triggerAutoSave(${product.id})"
                                           class="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm" 
                                           placeholder="https://...">
                                    <i data-lucide="link" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400"></i>
                                </div>
                                ${product.catalog_link ? `
                                <a href="${product.catalog_link}" target="_blank" 
                                   class="p-2 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 text-gray-500 transition-colors shadow-sm"
                                   title="Abrir enlace">
                                     <i data-lucide="external-link" class="h-5 w-5"></i>
                                </a>` : ''}
                            </div>
                        </div>

                    </div>

                    <!-- Key Stats Grid -->
                    <div class="grid grid-cols-2 gap-4 mb-6 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Precio Venta ($)</label>
                            <input type="number" id="edit_price" value="${product.price || ''}" oninput="triggerAutoSave(${product.id})"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm" step="0.01">
                        </div>
                        <div>
                            <p class="text-xs text-gray-500 mb-1 text-right">Stock Disponible</p>
                            <span class="text-xl font-bold text-gray-900 block text-right">
                                ${product.stock || 0}
                            </span>
                        </div>
                         <div class="col-span-2 pt-3 border-t border-gray-100 flex justify-between items-center">
                            <div class="text-sm">
                                <span class="text-gray-500">Marca:</span>
                                <span class="font-medium text-gray-900 ml-1">${product.brand || '-'}</span>
                            </div>
                            <!-- Status Badge -->
                            <div>
                            ${product.status
                    ? `<span id="detail-status-badge-${product.id}" class="${product.status.toLowerCase() === 'active' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'} px-2.5 py-1 rounded-full text-xs font-bold uppercase border">${product.status}</span>`
                    : '<span id="detail-status-badge-' + product.id + '" class="bg-gray-100 text-gray-600 border-gray-200 px-2.5 py-1 rounded-full text-xs font-medium border">No Publicado</span>'
                }
                            </div>
                        </div>
                    </div>


                    <!-- MercadoLibre Info Section -->
                    ${product.meli_id ? `
                    <div class="mb-6 bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex items-center gap-4">
                        <div class="flex-shrink-0">
                            <img src="/static/img/meli-logo-light.png" alt="MercadoLibre" class="h-14 object-contain dark:hidden">
                            <img src="/static/img/meli-logo-dark.png" alt="MercadoLibre" class="h-14 object-contain hidden dark:block">
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-lg font-bold font-mono text-gray-900 tracking-wide">${product.meli_id}</p>
                        </div>
                        ${product.permalink ? `
                        <a href="${product.permalink}" target="_blank" rel="noopener"
                           class="flex-shrink-0 p-2.5 bg-yellow-200/60 hover:bg-yellow-300 text-yellow-800 rounded-lg transition-colors border border-yellow-300"
                           title="${product.permalink}">
                            <i data-lucide="external-link" class="h-5 w-5"></i>
                        </a>` : ''}
                    </div>` : ''}

                    <!-- Validation Issues (Collapsible) -->
                    <div class="mb-6">
                        ${(() => {
                    const hasIssues = product.reason || product.remedy;
                    const bgClass = hasIssues ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200';
                    const textClass = hasIssues ? 'text-orange-800' : 'text-gray-500';
                    const hoverClass = hasIssues ? 'hover:bg-orange-100' : 'hover:bg-gray-100';
                    const iconBgClass = hasIssues ? 'bg-orange-200/50 text-orange-700' : 'bg-gray-200/50 text-gray-400';
                    const subtextClass = hasIssues ? 'text-orange-600/80' : 'text-gray-400';
                    const chevronClass = hasIssues ? 'text-orange-600' : 'text-gray-400';
                    return `
                        <details class="group ${bgClass} border rounded-xl overflow-hidden transition-all duration-300 open:shadow-sm">
                            <summary class="flex items-center justify-between p-4 cursor-pointer list-none ${textClass} ${hoverClass} transition-colors select-none">
                                <div class="flex items-center gap-3">
                                    <div class="${iconBgClass} p-2 rounded-lg">
                                        <i data-lucide="${hasIssues ? 'alert-triangle' : 'check-circle'}" class="h-5 w-5"></i>
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="font-bold text-sm">${hasIssues ? 'Revisión Requerida' : 'Sin Revisiones Pendientes'}</span>
                                        <span class="text-xs ${subtextClass}">${hasIssues ? 'Ver detalles de validación' : 'No hay problemas detectados'}</span>
                                    </div>
                                </div>
                                <i data-lucide="chevron-down" class="h-5 w-5 ${chevronClass} transition-transform group-open:rotate-180"></i>
                            </summary>
                            ${hasIssues ? `
                            <div class="p-4 pt-1 text-sm bg-orange-50/30 border-t border-orange-100/50">
                                ${product.reason ? `
                                <div class="mb-3">
                                    <strong class="block text-xs uppercase tracking-wider text-orange-700/70 mb-1">Motivo:</strong>
                                    <div class="bg-white p-3 rounded-lg border border-orange-100 text-gray-700 shadow-sm text-xs leading-relaxed font-mono">
                                        ${product.reason}
                                    </div>
                                </div>` : ''}
                                ${product.remedy ? `
                                <div>
                                    <strong class="block text-xs uppercase tracking-wider text-orange-700/70 mb-1">Solución Sugerida:</strong>
                                    <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-900 shadow-sm text-xs leading-relaxed flex gap-2">
                                        <i data-lucide="lightbulb" class="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500"></i>
                                        <span>${product.remedy}</span>
                                    </div>
                                </div>` : ''}
                            </div>` : ''}
                        </details>`;
                })()}
                    </div>

                    <!-- Drive Dropzone -->
                    <div class="mb-6">
                        <div id="drive-dropzone-${product.id}" 
                             class="relative p-4 rounded-xl border-2 border-dashed transition-all duration-200 group
                                    ${product.drive_url ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50 border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}"
                             ondragover="event.preventDefault(); this.classList.add('border-blue-500', 'bg-blue-100')"
                             ondragleave="this.classList.remove('border-blue-500', 'bg-blue-100')"
                             ondrop="handleDriveDrop(event, ${product.id})"
                             onclick="if(!event.target.closest('a, button')) document.getElementById('file-input-${product.id}').click()">
                            
                            <input type="file" id="file-input-${product.id}" class="hidden" multiple onchange="handleDriveFileSelect(event, ${product.id})">
                            
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="p-2 rounded-lg ${product.drive_url ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}">
                                        <i data-lucide="${product.drive_url ? 'folder-check' : 'folder-up'}" class="h-5 w-5"></i>
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-semibold ${product.drive_url ? 'text-blue-900' : 'text-gray-700'}">
                                            ${product.drive_url ? 'Carpeta de Drive' : 'Subir Fotos'}
                                        </h4>
                                        <p class="text-xs ${product.drive_url ? 'text-blue-600' : 'text-gray-500'}">
                                            ${product.drive_url ? 'Arrastra fotos para agregar' : 'Click para subir'}
                                        </p>
                                    </div>
                                </div>
                                ${product.drive_url ? `
                                    <a href="${product.drive_url}" target="_blank" 
                                       class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                       title="Abrir en Drive" onclick="event.stopPropagation()">
                                        <i data-lucide="external-link" class="h-4 w-4"></i>
                                    </a>
                                ` : ''}
                            </div>
                            
                            <!-- Upload Overlay -->
                            <div id="upload-overlay-${product.id}" class="hidden absolute inset-0 bg-white/90 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
                                <div class="flex items-center gap-3 text-blue-600 font-medium text-sm">
                                    <div class="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                    Subiendo...
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Meli Photo Tips link -->
                    <div class="mb-6 px-1">
                        <p class="text-xs text-gray-500 flex items-center gap-1.5">
                            <i data-lucide="help-circle" class="h-3.5 w-3.5 text-gray-400"></i>
                            Aquí te dejamos un enlace con las fotos recomendadas por Mercado Libre 
                            <a href="https://www.mercadolibre.com.ar/ayuda/Sacar-bue-nas-fotos-productos_805" target="_blank" rel="noopener" class="text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-0.5 transition-all">
                                Click aquí <i data-lucide="external-link" class="h-3 w-3"></i>
                            </a>
                        </p>
                    </div>

                    <!-- Description Editor -->
                    <div class="mb-6 flex-1 flex flex-col min-h-[150px] relative">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                            <span>Descripción</span>
                            <button id="btn-ai-description" onclick="triggerAIPrePublish(${product.id}, 'description')" 
                                class="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-md border border-purple-200 transition-colors shadow-sm flex items-center gap-1.5 text-xs font-medium"
                                title="Generar con AI">
                                <i data-lucide="sparkles" class="h-3 w-3"></i>
                                Generar con AI
                            </button>
                        </label>
                        <textarea id="edit_description" oninput="triggerAutoSave(${product.id})"
                                  class="flex-1 w-full p-4 border border-gray-300 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 resize-y min-h-[150px] shadow-inner"
                                  placeholder="Escribe una descripción detallada del producto...">${product.description || ''}</textarea>
                    </div>

                    <!-- Footer Actions -->
                    <div class="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-gray-100 flex gap-3 z-10">
                        <button onclick="closeModal()" 
                                class="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors border border-gray-200">
                            Cerrar
                        </button>
                        
                        <div id="auto-save-status" class="flex-1 flex items-center px-2"></div>

                        ${product.meli_id ? `
                        <button onclick="triggerProductUpdate(${product.id}, this)" 
                                class="px-4 py-2.5 bg-green-50 text-green-700 border border-green-300 rounded-lg hover:bg-green-100 font-medium transition-colors flex items-center gap-2"
                                title="Actualizar en MercadoLibre">
                            <i data-lucide="rotate-cw" class="h-5 w-5"></i>
                            <span class="hidden sm:inline">Actualizar</span>
                        </button>` : ''}

                        <div class="w-px h-auto bg-gray-200 mx-1"></div>

                        ${isActive
                    ? `<button onclick="togglePublishFromDetail(${product.id}, false)" 
                               class="px-5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors flex items-center gap-2"
                               title="Pausar publicación">
                                <i data-lucide="pause-circle" class="h-5 w-5"></i>
                                <span>Pausar</span>
                               </button>`
                    : `<button onclick="togglePublishFromDetail(${product.id}, true)" 
                               class="px-5 py-2.5 bg-[#fff159] text-[#2d3277] border border-yellow-400 rounded-lg hover:bg-[#fdd835] font-medium transition-colors flex items-center gap-2 shadow-sm"
                               title="Publicar en MercadoLibre">
                                <i data-lucide="shopping-bag" class="h-5 w-5"></i>
                                <span class="font-bold">Publicar</span>
                               </button>`}
                    </div>

                </div>
            </div>
            `;

            // Make modal wider for this view
            elements.modalContent.classList.remove('max-w-lg');
            elements.modalContent.classList.add('max-w-5xl');

            // Save original close function and add width reset
            const originalClose = window.closeModal;
            window.closeModal = () => {
                elements.modalContent.classList.remove('max-w-5xl');
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
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; // Don't nav while editing

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
    window.handleDriveDrop = async (e, productId) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove highlight styles
        const dropzone = e.currentTarget;
        dropzone.classList.remove('border-blue-500', 'bg-blue-100');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await uploadFilesToDrive(files, productId);
        }
    };

    window.handleDriveFileSelect = async (e, productId) => {
        const files = e.target.files;
        if (files.length > 0) {
            await uploadFilesToDrive(files, productId);
        }
    };

    async function uploadFilesToDrive(fileList, productId) {
        const overlay = document.getElementById(`upload-overlay-${productId}`);
        const dropzone = document.getElementById(`drive-dropzone-${productId}`);

        if (overlay) overlay.classList.remove('hidden');
        if (dropzone) dropzone.classList.add('pointer-events-none');

        let successCount = 0;
        let errorCount = 0;
        let lastError = null;
        let driveUrl = null;

        const files = Array.from(fileList);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append('file', file);

            // Update overlay text if possible
            const statusText = overlay.querySelector('.font-medium');
            if (statusText) statusText.innerText = `Subiendo (${i + 1}/${files.length})...`;

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
                driveUrl = result.drive_url;
                successCount++;
            } catch (e) {
                console.error(`Upload error for file ${file.name}:`, e);
                errorCount++;
                lastError = e.message;
            }
        }

        if (overlay) overlay.classList.add('hidden');
        if (dropzone) dropzone.classList.remove('pointer-events-none');

        // Update local state if we got a drive URL
        if (driveUrl) {
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].drive_url = driveUrl;
            }
        }

        // Final feedback
        if (errorCount === 0) {
            alert(successCount > 1 ? `¡${successCount} fotos subidas correctamente!` : '¡Foto subida correctamente!');
        } else if (successCount > 0) {
            alert(`Se subieron ${successCount} fotos, pero ${errorCount} fallaron. Último error: ${lastError}`);
        } else {
            alert('Error al subir las fotos: ' + lastError);
        }

        // Clear input
        const input = document.getElementById(`file-input-${productId}`);
        if (input) input.value = '';

        // Refresh UI
        openProductDetail(productId);
    }

    // Toggle publish from detail view and refresh the modal
    // Toggle publish from detail view and refresh the modal
    window.togglePublishFromDetail = async (productId, publish) => {
        const loadingText = publish ? 'Publicando...' : 'Pausando...';

        const button = event?.target?.closest('button');
        const originalText = button ? button.innerHTML : ''; // use innerHTML because original might have icon

        if (button) {
            // Keep width fixed
            button.style.width = getComputedStyle(button).width;

            button.disabled = true;
            button.innerText = loadingText;
            button.classList.add('opacity-50', 'cursor-wait');
        }

        try {
            const response = await authFetch(`/api/products/${productId}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: publish ? 'publish' : 'pause' })
            });
            if (!response.ok) throw new Error('Error updating product');

            // Success: Update UI status badge only
            const statusBadge = document.getElementById(`detail-status-badge-${productId}`);
            if (statusBadge) {
                statusBadge.textContent = "EN PROCESO";
                statusBadge.className = "bg-blue-100 text-blue-700 border-blue-200 px-2.5 py-1 rounded-full text-xs font-bold uppercase border animate-pulse";
            }

            // Also update local state so if they navigate away and come back it MIGHT still be there (though full refresh will kill it)
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].status = "En Proceso";
            }

        } catch (e) {
            console.error('Error:', e);
            alert('Error al cambiar el estado');
        } finally {
            // Always restore button
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
                button.classList.remove('opacity-50', 'cursor-wait');
                button.style.width = '';
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

            // Update local state to "actualizando"
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].status = 'actualizando';
                renderProducts();
            }

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

                <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Título MercadoLibre</label>
                            <div class="flex gap-2">
                                <input type="text" id="detail-product_name_meli" 
                                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                                <button id="btn-ai-product_name_meli" onclick="triggerAIPrePublish(${productId}, 'product_name_meli')" 
                                    class="mt-1 px-3 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md border border-purple-200 transition-colors"
                                    title="Generar con AI">
                                    <i data-lucide="sparkles" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</label>
                            <div class="relative">
                                <textarea id="detail-description" rows="12" 
                                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"></textarea>
                                <button id="btn-ai-description" onclick="triggerAIPrePublish(${productId}, 'description')" 
                                    class="absolute top-2 right-2 p-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md border border-purple-200 transition-colors"
                                    title="Generar con AI">
                                    <i data-lucide="sparkles" class="h-4 w-4"></i>
                                </button>
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

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }


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
            fetchProducts();
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

    // === Competence View Logic ===
    let compDebounceTimer = null;

    async function loadCompetenceData() {
        const loading = document.getElementById('compLoadingOverlay');
        const tableBody = document.getElementById('compTableBody');
        const emptyState = document.getElementById('compEmptyState');

        if (!tableBody) return;

        if (loading) loading.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        try {
            const searchInput = document.getElementById('compSearchInput');
            const statusFilter = document.getElementById('compStatusFilter');

            let params = new URLSearchParams();
            if (searchInput && searchInput.value.trim()) params.append('q', searchInput.value.trim());
            if (statusFilter && statusFilter.value) params.append('status', statusFilter.value);

            const response = await authFetch(`/api/competence?${params.toString()}`);
            if (!response.ok) throw new Error('Error loading competence data');

            const data = await response.json();
            const items = data.items || [];

            // Update counters
            const pendingEl = document.getElementById('compPendingCount');
            const completedEl = document.getElementById('compCompletedCount');
            const errorEl = document.getElementById('compErrorCount');
            const totalEl = document.getElementById('compTotalCount');
            const showingEl = document.getElementById('compShowing');

            if (pendingEl) pendingEl.textContent = data.pending_count || 0;
            if (completedEl) completedEl.textContent = data.completed_count || 0;
            if (errorEl) errorEl.textContent = data.error_count || 0;
            if (totalEl) totalEl.textContent = data.total || 0;
            if (showingEl) showingEl.textContent = items.length;

            if (items.length === 0) {
                tableBody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
            } else {
                tableBody.innerHTML = items.map(item => {
                    const price = item.price ? `$ ${Number(item.price).toLocaleString('es-AR')}` : '-';
                    const imgHtml = item.image
                        ? `<img src="${item.image}" alt="" class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600" onerror="this.style.display='none'">`
                        : `<div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center"><svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`;

                    const statusBadge = getCompStatusBadge(item.status);

                    const linkHtml = item.catalog_link
                        ? `<a href="${item.catalog_link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-xs font-medium">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            Ver
                           </a>`
                        : `<span class="text-gray-400 text-xs">-</span>`;

                    const apiCost = item.api_cost_total ? `$${Number(item.api_cost_total).toFixed(4)}` : '-';
                    const credits = item.remaining_credits ? Number(item.remaining_credits).toFixed(4) : '-';
                    const dateFormatted = item.timestamp ? new Date(item.timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' }) : '-';
                    // meli_id removed
                    const prodCode = item.product_code ? `<br><span class="text-xs text-gray-400">Cod: ${item.product_code}</span>` : '';

                    return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td class="px-4 py-3">${imgHtml}</td>
                        <td class="px-4 py-3 text-xs font-mono text-gray-500">${item.meli_id || '-'}</td>
                        <td class="px-4 py-3">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[300px]" title="${item.title || item.product_name || ''}">${item.title || item.product_name || 'Pendiente...'}</p>
                                ${prodCode}
                            </div>
                        </td>
                        <td class="px-4 py-3">
                            <span class="text-sm text-gray-700 dark:text-gray-300">${item.competitor || '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="text-sm font-semibold text-purple-600 dark:text-purple-400">${price}</span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="text-sm font-medium text-blue-600 dark:text-blue-400">${item.selling_price ? '$ ' + Number(item.selling_price).toLocaleString('es-AR') : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="text-sm text-gray-600 dark:text-gray-400">${item.product_cost ? '$ ' + Number(item.product_cost).toLocaleString('es-AR') : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="text-sm font-bold text-green-600 dark:text-green-400">${item.net_profit ? '$ ' + Number(item.net_profit).toLocaleString('es-AR') : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <span class="text-xs text-gray-600 dark:text-gray-400">${item.net_margin_percentage ? Number(item.net_margin_percentage).toFixed(1) + '%' : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <span class="text-xs text-gray-600 dark:text-gray-400">${item.markup_percentage ? Number(item.markup_percentage).toFixed(1) + '%' : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-center">${linkHtml}</td>
                        <td class="px-4 py-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <button onclick="openCompetenceModal('${item.catalog_link}')" class="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Configurar Costos">
                                    <i data-lucide="calculator" class="h-4 w-4"></i>
                                </button>
                                <button onclick="deleteCompetenceItem(this.dataset.url)" data-url="${item.catalog_link}" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar">
                                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                }).join('');
            }
        } catch (e) {
            console.error('Error loading competence data:', e);
            tableBody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">Error al cargar datos de competencia: ${e.message}</td></tr>`;
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }

    window.initCompetenceDB = async function () {
        if (!confirm('Esto intentará crear la tabla mercadolibre.scrapped_competence si no existe. ¿Continuar?')) return;

        try {
            const btn = document.querySelector('button[onclick="initCompetenceDB()"]');
            if (btn) {
                btn.disabled = true;
                btn.innerText = 'Inicializando...';
            }

            const response = await authFetch('/api/competence/init-db', {
                method: 'POST'
            });
            const result = await response.json();

            if (!response.ok) throw new Error(result.detail || 'Error desconocido');

            alert('Resultado: ' + (result.message || 'Operación completada'));
            loadCompetenceData(); // Reload data
        } catch (e) {
            alert('Error al inicializar: ' + e.message);
            console.error(e);
            // Re-enable button logic if needed, but page reload is safer
        }
    };


    function getCompStatusBadge(status) {
        const s = (status || '').toLowerCase();
        if (s === 'completed') return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Completado</span>`;
        if (s === 'error') return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"><span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Error</span>`;
        if (s === 'processing') return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Procesando</span>`;
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pendiente</span>`;
    }

    window.addCompetenceUrl = async function () {
        const urlInput = document.getElementById('compNewUrl');
        const btn = document.getElementById('btnAddCompUrl');
        if (!urlInput || !urlInput.value.trim()) {
            alert('Ingresa una URL válida de MercadoLibre');
            return;
        }

        const url = urlInput.value.trim();
        btn.disabled = true;
        btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Agregando...';

        try {
            const response = await authFetch('/api/competence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ catalog_link: url })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Error al agregar');
            }

            urlInput.value = '';
            loadCompetenceData();
        } catch (e) {
            console.error('Error adding competence URL:', e);

            // Show detailed error first
            let msg = 'Error: ' + e.message;
            if (e.message.includes('denied')) msg += '\n\nParece un problema de PERMISOS.';
            if (e.message.includes('default value')) msg += '\n\nFaltan datos obligatorios en la tabla.';

            alert(msg);

            // Offer diagnostics if relevant
            if (e.message.includes('denied') || e.message.includes('OperationalError')) {
                if (confirm('¿Quieres ver los permisos actuales de la base de datos para diagnosticar?')) {
                    checkPermissions();
                }
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="plus" class="h-4 w-4"></i> Agregar';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    window.checkPermissions = async function () {
        try {
            const response = await authFetch('/api/competence/debug-permissions');
            const data = await response.json();
            alert('DIAGNÓSTICO DE PERMISOS:\n\n' + JSON.stringify(data, null, 2));
        } catch (err) {
            alert('Error al verificar permisos: ' + err.message);
        }
    };

    window.deleteCompetenceItem = async function (url) {
        if (!url) return;
        if (!confirm('¿Eliminar este registro de competencia?')) return;

        try {
            // Encode URL for query param
            const encodedUrl = encodeURIComponent(url);
            const response = await authFetch(`/api/competence?url=${encodedUrl}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Error al eliminar');
            loadCompetenceData();
        } catch (e) {
            console.error('Error deleting competence item:', e);
            alert('Error: ' + e.message);
        }
    };

    window.openCompetenceModal = async function (itemUrl) {
        setLoading(true);
        try {
            const encodedUrl = encodeURIComponent(itemUrl);
            const response = await authFetch(`/api/competence/item?url=${encodedUrl}`);
            if (!response.ok) throw new Error('No se pudo obtener la información de competencia');
            const item = await response.json();

            const html = `
            <div class="flex flex-col h-full max-h-[90vh]">
                <!-- Header -->
                <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <div class="flex items-center gap-4">
                        <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                            <i data-lucide="calculator" class="h-6 w-6 text-blue-600 dark:text-blue-400"></i>
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Calculadora de Costos y Márgenes</h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400">${item.title || item.product_name || 'Sin título'}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <i data-lucide="x" class="h-6 w-6 text-gray-500"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    
                    <!-- Section: Base & Sales -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <!-- Selling Price (Calculated / Editable) -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-500 uppercase flex justify-between">Precio de Venta <span class="text-[10px] text-gray-400 font-normal normal-case">Tu Precio</span></label>
                            <div class="relative">
                                <input type="number" id="comp_selling_price" value="${item.selling_price || ''}" oninput="calculateCompetenceCosts()"
                                    class="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                                <i data-lucide="dollar-sign" class="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                        <!-- Product Cost (Editable) -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Costo del Producto</label>
                            <div class="relative">
                                <input type="number" id="comp_product_cost" value="${item.product_cost || ''}" oninput="calculateCompetenceCosts()"
                                    class="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                                <i data-lucide="package" class="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                         <!-- Listing Type -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Tipo de Publicación</label>
                            <select id="comp_listing_type" onchange="calculateCompetenceCosts()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                                <option value="Clásica" ${item.listing_type === 'Clásica' ? 'selected' : ''}>Clásica</option>
                                <option value="Premium" ${item.listing_type === 'Premium' ? 'selected' : ''}>Premium</option>
                            </select>
                        </div>
                    </div>

                    <!-- Section: Commissions & Taxes -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                         <!-- Commission % -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">% Comisión ML</label>
                            <div class="relative">
                                <input type="number" id="comp_ml_commision_percentage" step="0.01" value="${item.ml_commision_percentage || ''}" oninput="calculateCompetenceCosts()"
                                    class="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                                <i data-lucide="percent" class="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                         <!-- Commission Amount (Calculated) -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-500 uppercase flex justify-between">Comisión ML ($) <span class="text-[10px] text-blue-500 font-normal normal-case">Automático</span></label>
                            <div class="relative">
                                <input type="number" disabled id="comp_ml_commision_amount" value="${item.ml_commision || ''}" 
                                    class="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold opacity-70">
                                <i data-lucide="coins" class="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                         <!-- Returns % -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">% Devoluciones Estimado</label>
                            <div class="relative">
                                <input type="number" id="comp_estimated_returns_percentage" step="0.01" value="${item.estimated_returns_percentage || ''}" oninput="calculateCompetenceCosts()"
                                    class="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                                <i data-lucide="percent" class="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>
                    </div>

                    <!-- Section: Physical Costs -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Costo Envío</label>
                            <input type="number" id="comp_shipping_cost" value="${item.shipping_cost || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Packaging</label>
                            <input type="number" id="comp_packaging_cost" value="${item.packaging_cost || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Publicidad</label>
                            <input type="number" id="comp_advertising_cost" value="${item.advertising_cost || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">IIBB / Retenciones</label>
                            <input type="number" id="comp_withholdings_gross_income_tax" value="${item.withholdings_gross_income_tax || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Costo Financiero</label>
                            <input type="number" id="comp_financial_cost" value="${item.financial_cost || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>
                    </div>

                    <!-- Section: Final Totals (Calculated) -->
                    <div class="bg-gray-900 rounded-2xl p-6 text-white grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div class="space-y-1">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Costos</p>
                            <p id="comp_display_total_costs" class="text-xl font-bold">${formatCurrency(item.total_costs)}</p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ganancia Neta</p>
                            <p id="comp_display_net_profit" class="text-xl font-bold ${Number(item.net_profit) >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(item.net_profit)}</p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Margen Neto</p>
                            <p id="comp_display_margin" class="text-xl font-bold">${item.net_margin_percentage ? Number(item.net_margin_percentage).toFixed(1) + '%' : '-'}</p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Markup</p>
                            <p id="comp_display_markup" class="text-xl font-bold">${item.markup_percentage ? Number(item.markup_percentage).toFixed(1) + '%' : '-'}</p>
                        </div>
                    </div>

                </div>

                <!-- Footer -->
                <div class="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                    <button onclick="closeModal()" class="flex-1 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Cerrar</button>
                    <button onclick="saveCompetenceData('${item.catalog_link}')" id="btnSaveCompCalc" 
                        class="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-[0.98]">
                        Guardar Configuración
                    </button>
                </div>
            </div>
            `;

            elements.modalContent.classList.remove('max-w-lg');
            elements.modalContent.classList.add('max-w-4xl');

            const originalClose = window.closeModal;
            window.closeModal = () => {
                elements.modalContent.classList.remove('max-w-4xl');
                elements.modalContent.classList.add('max-w-lg');
                originalClose();
                window.closeModal = originalClose;
            };

            openModal('', html);
            lucide.createIcons();

        } catch (e) {
            console.error(e);
            alert('Error al abrir calculadora: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    window.calculateCompetenceCosts = function () {
        const sellingPrice = parseFloat(document.getElementById('comp_selling_price').value) || 0;
        const productCost = parseFloat(document.getElementById('comp_product_cost').value) || 0;
        const listingType = document.getElementById('comp_listing_type').value;

        // Auto-set commission % based on listing type if it's empty or we want to force it
        const commPctInput = document.getElementById('comp_ml_commision_percentage');
        // If listing type changed and it's a new entry or they haven't touched the % yet
        // logic... for now let's just use what's there but maybe add a helper

        const mlCommPct = parseFloat(commPctInput.value) || 0;
        const estRetPct = parseFloat(document.getElementById('comp_estimated_returns_percentage').value) || 0;

        const shipCost = parseFloat(document.getElementById('comp_shipping_cost').value) || 0;
        const packCost = parseFloat(document.getElementById('comp_packaging_cost').value) || 0;
        const advCost = parseFloat(document.getElementById('comp_advertising_cost').value) || 0;
        const taxes = parseFloat(document.getElementById('comp_withholdings_gross_income_tax').value) || 0;
        const finCost = parseFloat(document.getElementById('comp_financial_cost').value) || 0;

        // Calculations
        const mlComm = sellingPrice * (mlCommPct / 100);
        const retCost = sellingPrice * (estRetPct / 100);
        const totalCosts = productCost + mlComm + shipCost + packCost + advCost + retCost + taxes + finCost;
        const profit = sellingPrice - totalCosts;
        const margin = (profit / sellingPrice) * 100 || 0;
        const markup = (profit / productCost) * 100 || 0;

        // Update UI
        const commAmtInput = document.getElementById('comp_ml_commision_amount');
        if (commAmtInput) commAmtInput.value = mlComm.toFixed(2);

        const totalCostsEl = document.getElementById('comp_display_total_costs');
        const profitEl = document.getElementById('comp_display_net_profit');
        const marginEl = document.getElementById('comp_display_margin');
        const markupEl = document.getElementById('comp_display_markup');

        if (totalCostsEl) totalCostsEl.innerText = formatCurrency(totalCosts);
        if (profitEl) {
            profitEl.innerText = formatCurrency(profit);
            profitEl.className = `text-xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`;
        }
        if (marginEl) marginEl.innerText = margin.toFixed(1) + '%';
        if (markupEl) markupEl.innerText = markup.toFixed(1) + '%';
    };

    window.saveCompetenceData = async function (itemUrl) {
        const btn = document.getElementById('btnSaveCompCalc');
        const originalText = btn.innerText;

        try {
            btn.disabled = true;
            btn.innerText = 'Guardando...';

            const payload = {
                selling_price: parseFloat(document.getElementById('comp_selling_price').value) || 0,
                product_cost: parseFloat(document.getElementById('comp_product_cost').value) || 0,
                listing_type: document.getElementById('comp_listing_type').value,
                ml_commision_percentage: parseFloat(document.getElementById('comp_ml_commision_percentage').value) || 0,
                estimated_returns_percentage: parseFloat(document.getElementById('comp_estimated_returns_percentage').value) || 0,
                shipping_cost: parseFloat(document.getElementById('comp_shipping_cost').value) || 0,
                packaging_cost: parseFloat(document.getElementById('comp_packaging_cost').value) || 0,
                advertising_cost: parseFloat(document.getElementById('comp_advertising_cost').value) || 0,
                withholdings_gross_income_tax: parseFloat(document.getElementById('comp_withholdings_gross_income_tax').value) || 0,
                financial_cost: parseFloat(document.getElementById('comp_financial_cost').value) || 0
            };

            const encodedUrl = encodeURIComponent(itemUrl);
            const response = await authFetch(`/api/competence/item?url=${encodedUrl}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al guardar los cálculos');

            btn.innerText = '¡Guardado!';
            btn.classList.remove('bg-blue-600');
            btn.classList.add('bg-green-600');

            setTimeout(() => {
                closeModal();
                loadCompetenceData();
            }, 1000);

        } catch (e) {
            alert('Error: ' + e.message);
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };

    window.startScraping = async function () {
        if (!confirm('¿Estás seguro de iniciar el proceso de scrapping global? Esto puede tardar varios minutos.')) return;

        const btn = document.getElementById('btnStartScraping');
        const originalContent = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Iniciando...';

            const response = await authFetch('/api/competence/start-scraping', {
                method: 'POST'
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Error al iniciar el scrapping');
            }

            const result = await response.json();
            alert('Scrapping iniciado correctamente. Los resultados aparecerán gradualmente.');
            loadCompetenceData();

        } catch (e) {
            console.error('Error starting scraping:', e);
            alert('Error al iniciar scrapping: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            lucide.createIcons();
        }
    };

    window.triggerAIPrePublish = async function (productId, field) {
        let promptText = prompt(`Ingresa el prompt para generar ${field === 'product_name_meli' ? 'el título' : 'la descripción'}:`);
        if (!promptText) return;

        const btnId = `btn-ai-${field}`;
        const btn = document.getElementById(btnId);
        const originalContent = btn ? btn.innerHTML : '';

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600"></div>';
            }

            const response = await authFetch(`/api/products/${productId}/pre-publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptText,
                    field: field
                })
            });

            if (!response.ok) {
                const text = await response.text();
                let errorMsg = 'Error en la solicitud de AI';
                try {
                    const errData = JSON.parse(text);
                    if (errData.detail) errorMsg = errData.detail;
                } catch (e) {
                    if (text) errorMsg = `Server Error: ${text.substring(0, 200)}`;
                }
                throw new Error(errorMsg);
            }

            alert('✨ Solicitud enviada al servicio de AI. El campo se actualizará en unos momentos.');

        } catch (e) {
            console.error('AI Error:', e);
            alert('Error al solicitar generación AI: ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalContent;
                lucide.createIcons();
            }
        }
    };

    window.startScraping = async function () {
        if (!confirm('¿Estás seguro de iniciar el proceso de scrapping global? Esto puede tardar varios minutos.')) return;

        const btn = document.getElementById('btnStartScraping');
        const originalContent = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = `
                <div class="flex items-center justify-center w-full gap-2 font-semibold">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                    <span>Iniciando...</span>
                </div>
            `;

            const response = await authFetch('/api/competence/start-scraping', {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Error al iniciar el scrapping');
            }

            const result = await response.json();
            alert('Scrapping iniciado correctamente. Los resultados aparecerán gradualmente.');
            loadCompetenceData(); // Refresh to see specific status updates if any

        } catch (e) {
            console.error('Error starting scraping:', e);
            alert('Error al iniciar scrapping: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            lucide.createIcons();
        }
    };



    // Competence event listeners
    const compSearchInput = document.getElementById('compSearchInput');
    const compStatusFilter = document.getElementById('compStatusFilter');

    if (compSearchInput) {
        compSearchInput.addEventListener('input', () => {
            clearTimeout(compDebounceTimer);
            compDebounceTimer = setTimeout(loadCompetenceData, 300);
        });
    }

    if (compStatusFilter) {
        compStatusFilter.addEventListener('change', loadCompetenceData);
    }

    // === End Competence ===

    // --- Prompts Logic ---
    async function loadPrompts() {
        const container = document.getElementById('promptsContainer');
        if (!container) return;

        container.innerHTML = '<div class="flex justify-center p-12"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>';

        try {
            const response = await authFetch('/api/prompts/');
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Error fetching prompts');
            }
            const prompts = await response.json();

            if (prompts.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-500">No se encontraron configuraciones de prompts.</p>';
                return;
            }
            // Assume first row is the config
            renderPrompts(prompts[0]);

        } catch (error) {
            console.error(error);
            container.innerHTML = `<p class="text-center text-red-500">Error al cargar prompts: ${error.message}</p>`;
        }
    }

    function renderPrompts(promptData) {
        const container = document.getElementById('promptsContainer');
        if (!container) return;

        container.dataset.promptId = promptData.id;

        const fields = [
            { key: 'ai_general', label: 'Prompt General AI', editable: true, rows: 6 },
            { key: 'rules', label: 'Reglas de Negocio', editable: true, rows: 6 },
            { key: 'ai_improving_human_reply', label: 'Mejora de Respuesta Humana', editable: true, rows: 4 },
            { key: 'ai_auditor', label: 'Auditor AI', editable: false, rows: 3 },
            { key: 'ai_category', label: 'Categorización AI', editable: false, rows: 3 },
            { key: 'ai_inventory_search', label: 'Búsqueda Inventario', editable: false, rows: 3 }
        ];

        container.innerHTML = fields.map(field => `
            <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-100 dark:border-gray-600">
                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                    ${field.label} ${field.editable ? '' : '<span class="text-xs text-gray-400 font-normal normal-case ml-2">(Solo Lectura)</span>'}
                </label>
                <textarea 
                    id="prompt_${field.key}"
                    class="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-sm font-mono text-sm leading-relaxed"
                    rows="${field.rows}"
                    ${field.editable ? '' : 'readonly disabled'}
                >${promptData[field.key] || ''}</textarea>
            </div>
        `).join('');
    }

    window.savePrompts = async () => {
        const container = document.getElementById('promptsContainer');
        const id = container.dataset.promptId;
        if (!id) return;

        const btn = document.getElementById('btnSavePrompts');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> Guardando...';

        try {
            const payload = {
                ai_general: document.getElementById('prompt_ai_general').value,
                rules: document.getElementById('prompt_rules').value,
                ai_improving_human_reply: document.getElementById('prompt_ai_improving_human_reply').value
            };

            const response = await authFetch(`/api/prompts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error saving prompts');

            btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            btn.classList.add('bg-green-600', 'hover:bg-green-700');
            btn.innerHTML = '<i data-lucide="check" class="h-4 w-4 mr-2"></i> Guardado';

            setTimeout(() => {
                btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                btn.innerHTML = originalText;
                btn.disabled = false;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }, 2000);

        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Initial load - check auth FIRST, only load data if authenticated
    checkAuth();

    const token = localStorage.getItem('token');
    if (token) {
        fetchProducts();
    }

}); // End DOMContentLoaded

// Global Mobile Menu Logic
window.toggleMobileMenu = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar.classList.contains('-translate-x-full')) {
        // Open
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        // Close
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
};

window.closeMobileMenu = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
};


