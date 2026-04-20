/**
 * Tienda Nube Management Module
 * Handles loading, rendering, and updating products in Tienda Nube
 */

(function() {
    const tnState = {
        products: [],
        page: 1,
        limit: 50,
        total: 0,
        search: '',
        status: '',
        category: '',
        isLoading: false
    };

    const tnElements = {
        tableBody: document.getElementById('tnTableBody'),
        loading: document.getElementById('tnLoadingOverlay'),
        empty: document.getElementById('tnEmptyState'),
        searchInput: document.getElementById('tnSearchInput'),
        statusFilter: document.getElementById('tnStatusFilter'),
        categoryFilter: document.getElementById('tnCategoryFilter'),
        showingCount: document.getElementById('tnShowing'),
        pageNum: document.getElementById('tnPageNum'),
        btnPrev: document.getElementById('tnBtnPrev'),
        btnNext: document.getElementById('tnBtnNext'),
        activeCount: document.getElementById('tnActiveCount'),
        unpublishedCount: document.getElementById('tnUnpublishedCount'),
        totalCount: document.getElementById('tnTotalCount')
    };

    // --- Core Functions ---

    window.loadTiendaNubeProducts = async function() {
        if (tnState.isLoading) return;
        setTNLoading(true);

        try {
            const skip = (tnState.page - 1) * tnState.limit;
            const params = new URLSearchParams({
                skip: skip,
                limit: tnState.limit,
                site: 'tienda-nube' // Backend hint
            });

            if (tnState.search) params.append('q', tnState.search);
            if (tnState.status) params.append('status', tnState.status);
            if (tnState.category) params.append('category', tnState.category);

            const response = await authFetch(`/api/products/?${params.toString()}`);
            if (!response.ok) throw new Error('Error al cargar productos de Tienda Nube');

            const data = await response.json();
            
            if (Array.isArray(data)) {
                tnState.products = data;
                tnState.total = data.length < tnState.limit ? skip + data.length : skip + 1000;
            } else {
                tnState.products = data.items || [];
                tnState.total = data.total || 0;
            }

            renderTiendaNubeTable();
            updateTNPagination();
            updateTNSummary();
        } catch (error) {
            console.error('TN Load Error:', error);
            alert('No se pudieron cargar los productos de Tienda Nube.');
        } finally {
            setTNLoading(false);
        }
    };

    function renderTiendaNubeTable() {
        if (!tnElements.tableBody) return;
        tnElements.tableBody.innerHTML = '';

        if (tnState.products.length === 0) {
            tnElements.empty.classList.remove('hidden');
            return;
        }

        tnElements.empty.classList.add('hidden');

        tnState.products.forEach(product => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group';
            tr.onclick = () => openTiendaNubeDetail(product.id);

            const statusInfo = getTNStatusBadge(product.tienda_nube_status || 'Sin Publicar');
            
            tr.innerHTML = `
                <td class="px-4 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                            <img src="${product.product_image_b_format_url || 'https://via.placeholder.com/40'}" class="h-full w-full object-cover">
                        </div>
                        <div class="max-w-[200px]">
                            <p class="text-sm font-semibold text-gray-900 dark:text-white truncate" title="${product.product_name}">${product.product_name}</p>
                            <p class="text-[10px] text-gray-500 uppercase font-bold">${product.category || 'Sin Categoría'}</p>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-600 dark:text-gray-400">
                    ${product.product_code}
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-right">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">
                        $ ${Number(product.price_tienda_nube || product.price || 0).toLocaleString('es-AR')}
                    </span>
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-center">
                    <span class="text-sm ${product.stock > 0 ? 'text-gray-600' : 'text-red-500 font-bold'}">${product.stock || 0}</span>
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-center">
                    ${statusInfo}
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-center text-[10px] text-gray-400">
                    ${product.tienda_nube_last_sync ? new Date(product.tienda_nube_last_sync).toLocaleString() : '-'}
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-center">
                    <button class="p-1.5 text-gray-400 hover:text-[#1B2160] hover:bg-[#EEF0FF] rounded-lg transition-all">
                        <i data-lucide="edit-3" class="h-4 w-4"></i>
                    </button>
                </td>
            `;
            tnElements.tableBody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    function getTNStatusBadge(status) {
        const s = status.toLowerCase();
        if (s === 'active' || s === 'publicado') {
            return `<span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase border" style="background:#E6FFFA;color:#2C7A7B;border-color:#B2F5EA">Activo</span>`;
        }
        if (s === 'en proceso' || s === 'sincronizando') {
            return `<span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">Sincronizando</span>`;
        }
        if (s === 'error') {
            return `<span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700 border border-red-200">Error</span>`;
        }
        return `<span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-500 border border-gray-200">Sin publicar</span>`;
    }

    // --- Modal Logic ---

    window.openTiendaNubeDetail = async function(productId) {
        setTNLoading(true);
        try {
            const response = await authFetch(`/api/products/${productId}`);
            if (!response.ok) throw new Error('Error al cargar detalle');
            const product = await response.json();

            // Fetch TN specific attributes if they exist
            let attributes = {};
            try {
                const attrRes = await authFetch(`/api/products/${productId}/tienda-nube-attributes`);
                if (attrRes.ok) attributes = await attrRes.json();
            } catch(e) { console.warn("No extra attributes found"); }

            const html = `
                <div class="flex flex-col h-full max-h-[90vh]">
                    <!-- Header -->
                    <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <div class="flex items-center gap-3">
                            <div class="p-2 rounded-lg" style="background:#EEF0FF">
                                <svg class="h-6 w-6" viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <circle cx="18" cy="26" r="13" stroke="#1B2160" stroke-width="5" fill="none"/>
                                  <circle cx="36" cy="18" r="15" stroke="#1B2160" stroke-width="5" fill="none"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-900">${product.product_name}</h3>
                                <p class="text-xs text-gray-500">SKU: ${product.product_code} | Tienda Nube Manager</p>
                            </div>
                        </div>
                        <button onclick="closeModal()" class="p-2 hover:bg-gray-200 rounded-full transition-colors">
                            <i data-lucide="x" class="h-5 w-5 text-gray-500"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <form id="tnAttributesForm" class="space-y-6">
                            <!-- SEO Section -->
                            <div>
                                <h4 class="text-xs font-bold text-[#1B2160] uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <i data-lucide="search" class="h-3 w-3"></i> Optimización SEO
                                </h4>
                                <div class="grid grid-cols-1 gap-4">
                                    <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Título SEO (Recomendado 70 caracteres)</label>
                                        <input type="text" name="seo_title" value="${attributes.seo_title || product.product_name_meli || ''}" 
                                            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">
                                    </div>
                                    <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                        <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descripción SEO (Meta-description)</label>
                                        <textarea name="seo_description" rows="2" 
                                            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">${attributes.seo_description || ''}</textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Media & Tags -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <h4 class="text-[10px] font-bold text-[#1B2160] uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <i data-lucide="video" class="h-3 w-3"></i> Video URL
                                    </h4>
                                    <input type="url" name="video_url" value="${attributes.video_url || ''}" placeholder="Youtube / Vimeo URL"
                                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">
                                </div>
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <h4 class="text-[10px] font-bold text-[#1B2160] uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <i data-lucide="tag" class="h-3 w-3"></i> Etiquetas (Separadas por coma)
                                    </h4>
                                    <input type="text" name="tags" value="${attributes.tags || ''}" placeholder="oferta, nuevo, hogar..."
                                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">
                                </div>
                            </div>

                            <!-- Pricing & Details -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Precio Promocional</label>
                                    <div class="relative">
                                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                        <input type="number" name="promotional_price" value="${attributes.promotional_price || ''}" step="0.01"
                                            class="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none font-bold text-[#1B2160]">
                                    </div>
                                </div>
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">MPN (Cód. Fabricante)</label>
                                    <input type="text" name="mpn" value="${attributes.mpn || ''}"
                                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">
                                </div>
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Estado en TN</label>
                                    <div class="mt-1 font-bold text-sm uppercase">
                                        ${getTNStatusBadge(product.tienda_nube_status || 'Sin Publicar')}
                                    </div>
                                </div>
                            </div>

                            <!-- Segmentation -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Grupo de Edad</label>
                                    <select name="age_group" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">
                                        <option value="" ${!attributes.age_group ? 'selected' : ''}>No especificado</option>
                                        <option value="infant" ${attributes.age_group === 'infant' ? 'selected' : ''}>Infante</option>
                                        <option value="kid" ${attributes.age_group === 'kid' ? 'selected' : ''}>Niño</option>
                                        <option value="adult" ${attributes.age_group === 'adult' ? 'selected' : ''}>Adulto</option>
                                    </select>
                                </div>
                                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Género</label>
                                    <select name="gender" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1B2160] outline-none">
                                        <option value="" ${!attributes.gender ? 'selected' : ''}>No especificado</option>
                                        <option value="male" ${attributes.gender === 'male' ? 'selected' : ''}>Masculino</option>
                                        <option value="female" ${attributes.gender === 'female' ? 'selected' : ''}>Femenino</option>
                                        <option value="unisex" ${attributes.gender === 'unisex' ? 'selected' : ''}>Unisex</option>
                                    </select>
                                </div>
                            </div>
                        </form>
                    </div>

                    <!-- Footer -->
                    <div class="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <div class="flex gap-2">
                             <button onclick="deleteTNProduct(${product.id}, this)" class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-bold transition-all">
                                Desvincular de TN
                             </button>
                        </div>
                        <div class="flex gap-3">
                            <button onclick="toggleTNPublish(${product.id}, ${!(product.tienda_nube_status === 'active')}, this)" 
                                class="px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${product.tienda_nube_status === 'active' ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-green-600 text-white hover:bg-green-700'}">
                                ${product.tienda_nube_status === 'active' ? 'Pausar en TN' : 'Publicar en TN'}
                            </button>
                            <button onclick="saveTNAttributes(${product.id}, this)" class="px-5 py-2 bg-[#1B2160] text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                                Guardar Atributos
                            </button>
                        </div>
                    </div>
                </div>
            `;

            openModal('', html);
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error(e);
            alert('Error al cargar detalle de Tienda Nube');
        } finally {
            setTNLoading(false);
        }
    };

    window.saveTNAttributes = async function(productId, btn) {
        const form = document.getElementById('tnAttributesForm');
        if (!form) return;

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Convert prices to float
        if (data.promotional_price) data.promotional_price = parseFloat(data.promotional_price);

        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i> Guardando...';
        if (window.lucide) lucide.createIcons();

        try {
            const response = await authFetch(`/api/products/${productId}/tienda-nube-attributes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Error al guardar');
            }

            // Also trigger a normal product update to notify changes
            await authFetch(`/api/products/${productId}/notify`, { method: 'POST' });

            btn.classList.replace('bg-[#1B2160]', 'bg-green-600');
            btn.innerHTML = '<i data-lucide="check" class="h-4 w-4"></i> Guardado';
            if (window.lucide) lucide.createIcons();

            setTimeout(() => {
                btn.classList.replace('bg-green-600', 'bg-[#1B2160]');
                btn.innerHTML = originalHTML;
                if (window.lucide) lucide.createIcons();
                loadTiendaNubeProducts(); // Refresh list
            }, 2000);

        } catch (e) {
            console.error(e);
            alert('Error al guardar: ' + e.message);
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.toggleTNPublish = async function(productId, publish, btn) {
        const action = publish ? 'publish' : 'pause';
        const originalHTML = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i> ' + (publish ? 'Publicando...' : 'Pausando...');
        if (window.lucide) lucide.createIcons();

        try {
            const response = await authFetch(`/api/products/${productId}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action, site: 'tienda-nube' })
            });

            if (!response.ok) throw new Error('Error al cambiar estado');

            alert(publish ? 'Solicitud de publicación enviada a Tienda Nube' : 'Solicitud de pausa enviada a Tienda Nube');
            closeModal();
            loadTiendaNubeProducts();

        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.deleteTNProduct = async function(id, btn) {
        if (!confirm('¿Estás seguro de desvincular este producto de Tienda Nube? Se eliminará de la plataforma.')) return;
        
        btn.disabled = true;
        const originalText = btn.innerText;
        btn.innerText = 'Eliminando...';

        try {
            const response = await authFetch(`/api/products/${id}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', site: 'tienda-nube' })
            });

            if (!response.ok) throw new Error('Error al eliminar');

            alert('Eliminación iniciada correctamente.');
            closeModal();
            loadTiendaNubeProducts();
        } catch (e) {
            alert('Error: ' + e.message);
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };

    // --- Helpers ---

    function setTNLoading(isLoading) {
        tnState.isLoading = isLoading;
        if (tnElements.loading) {
            if (isLoading) tnElements.loading.classList.remove('hidden');
            else tnElements.loading.classList.add('hidden');
        }
    }

    function updateTNPagination() {
        if (tnElements.pageNum) tnElements.pageNum.innerText = tnState.page;
        if (tnElements.showingCount) tnElements.showingCount.innerText = tnState.products.length;
        if (tnElements.btnPrev) tnElements.btnPrev.disabled = tnState.page === 1;
        if (tnElements.btnNext) tnElements.btnNext.disabled = tnState.products.length < tnState.limit;
    }

    async function updateTNSummary() {
        // Fetch summary counts if backend provides them
        try {
            const res = await authFetch('/api/products/summary?site=tienda-nube');
            if (res.ok) {
                const summary = await res.json();
                if (tnElements.activeCount) tnElements.activeCount.innerText = summary.active || 0;
                if (tnElements.unpublishedCount) tnElements.unpublishedCount.innerText = summary.unpublished || 0;
                if (tnElements.totalCount) tnElements.totalCount.innerText = summary.total || 0;
            }
        } catch(e) {}
    }

    // --- Event Listeners ---

    if (tnElements.searchInput) {
        tnElements.searchInput.addEventListener('input', debounce(() => {
            tnState.search = tnElements.searchInput.value;
            tnState.page = 1;
            loadTiendaNubeProducts();
        }, 500));
    }

    if (tnElements.statusFilter) {
        tnElements.statusFilter.addEventListener('change', () => {
            tnState.status = tnElements.statusFilter.value;
            tnState.page = 1;
            loadTiendaNubeProducts();
        });
    }

    if (tnElements.categoryFilter) {
        tnElements.categoryFilter.addEventListener('change', () => {
            tnState.category = tnElements.categoryFilter.value;
            tnState.page = 1;
            loadTiendaNubeProducts();
        });
    }

    if (tnElements.btnPrev) {
        tnElements.btnPrev.addEventListener('click', () => {
            if (tnState.page > 1) {
                tnState.page--;
                loadTiendaNubeProducts();
            }
        });
    }

    if (tnElements.btnNext) {
        tnElements.btnNext.addEventListener('click', () => {
            tnState.page++;
            loadTiendaNubeProducts();
        });
    }

    // Helper debounce
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Load categories for filter
    async function loadTNCategories() {
        try {
            const res = await authFetch('/api/products/categories');
            if (res.ok) {
                const categories = await res.json();
                if (tnElements.categoryFilter) {
                    const currentVal = tnElements.categoryFilter.value;
                    tnElements.categoryFilter.innerHTML = '<option value="">Todas las categorías</option>';
                    categories.forEach(cat => {
                        const opt = document.createElement('option');
                        opt.value = cat;
                        opt.innerText = cat;
                        if (cat === currentVal) opt.selected = true;
                        tnElements.categoryFilter.appendChild(opt);
                    });
                }
            }
        } catch(e) {}
    }

    // Initialize module
    document.addEventListener('DOMContentLoaded', () => {
        loadTNCategories();
    });

})();
