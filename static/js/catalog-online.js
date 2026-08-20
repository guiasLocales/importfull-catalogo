/**
 * Catalog Online Management Module
 * Independent module for managing online catalog products and pause/activate status
 */
(function () {
    const catalogState = {
        products: [],
        isLoading: false,
        search: '',
        category: '',
        status: 'all'
    };

    let debounceTimer = null;

    window.debounceLoadPanelCatalog = function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(window.loadPanelCatalogProducts, 300);
    };

    window.loadPanelCatalogProducts = async function () {
        const tbody = document.getElementById('catalogAdminTableBody');
        if (!tbody) return;

        const searchInput = document.getElementById('catalogSearchInput');
        const categorySelect = document.getElementById('catalogCategoryFilter');
        const statusSelect = document.getElementById('catalogStatusFilter');

        const search = (searchInput ? searchInput.value : '').trim();
        const category = categorySelect ? categorySelect.value : '';
        const statusFilter = statusSelect ? statusSelect.value : 'all';

        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500 dark:text-gray-400">Cargando productos del catálogo...</td></tr>`;

        try {
            let sql = "SELECT id, product_code, product_name, price AS local_price, product_image_b_format_url, product_type_path, stock, brand, COALESCE(status, 'active') AS status FROM product_catalog_sync WHERE price IS NOT NULL AND price > 0 AND stock IS NOT NULL AND stock > 0 AND product_code != 'STORE_CONFIG_SYNC'";

            if (category) {
                const cleanCat = category.replace(/'/g, "''").toLowerCase();
                sql += ` AND LOWER(product_type_path) LIKE '%${cleanCat}%'`;
            }
            if (search) {
                const cleanSearch = search.replace(/'/g, "''").toLowerCase();
                sql += ` AND (LOWER(product_name) LIKE '%${cleanSearch}%' OR LOWER(product_code) LIKE '%${cleanSearch}%')`;
            }
            if (statusFilter === 'active') {
                sql += " AND (status IS NULL OR status != 'paused')";
            } else if (statusFilter === 'paused') {
                sql += " AND status = 'paused'";
            }

            sql += " ORDER BY product_name ASC LIMIT 500";

            const res = await fetch(`/api/test-db-query?query=${encodeURIComponent(sql)}`);
            if (!res.ok) throw new Error('Error de conexión');

            const json = await res.json();
            const products = (json.status === 'success' && Array.isArray(json.rows)) ? json.rows : [];

            if (products.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500 dark:text-gray-400">No se encontraron productos.</td></tr>`;
                return;
            }

            tbody.innerHTML = products.map(p => {
                const isPaused = p.status === 'paused';
                const price = parseFloat(p.local_price || 0);
                const imgUrl = p.product_image_b_format_url || 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=150&q=80';

                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td class="px-4 py-3">
                            <div class="flex items-center space-x-3">
                                <img src="${imgUrl}" class="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-gray-700" alt="">
                                <div>
                                    <div class="font-bold text-gray-900 dark:text-white text-sm">${p.product_name || 'Sin Nombre'}</div>
                                    <div class="text-xs text-gray-400">${p.brand || 'IMPORT FULL'}</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-4 py-3 text-xs font-mono text-gray-600 dark:text-gray-300 font-bold">${p.product_code || '-'}</td>
                        <td class="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">${p.product_type_path || 'GENERAL'}</td>
                        <td class="px-4 py-3 text-sm font-extrabold text-orange-600 dark:text-orange-400">$${price.toLocaleString('es-AR')}</td>
                        <td class="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">${p.stock || 0} u</td>
                        <td class="px-4 py-3 text-center">
                            ${isPaused ?
                                `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">⏸ PAUSADO</span>` :
                                `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">▶ ACTIVO (VISIBLE)</span>`
                            }
                        </td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="togglePanelProductStatus(${p.id}, '${p.status || 'active'}')"
                                class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                    isPaused ?
                                    'bg-emerald-600 hover:bg-emerald-700 text-white' :
                                    'bg-amber-500 hover:bg-amber-600 text-white'
                                }">
                                ${isPaused ? '▶ Activar en Catálogo' : '⏸ Pausar Producto'}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        } catch (e) {
            console.error('Error loading catalog products:', e);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error al cargar productos del catálogo.</td></tr>`;
        }
    };

    window.togglePanelProductStatus = async function (productId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'paused' : 'active';
        const updateSql = `UPDATE product_catalog_sync SET status = '${newStatus}' WHERE id = ${productId}`;

        try {
            const res = await fetch(`/api/test-db-query?query=${encodeURIComponent(updateSql)}`);
            if (res.ok) {
                window.loadPanelCatalogProducts();
            } else {
                alert('Error al actualizar estado del producto');
            }
        } catch (e) {
            alert('Error al cambiar el estado');
        }
    };
})();
