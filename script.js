const CONFIG = {
    URLS: {
        PERSONAS: 'https://docs.google.com/spreadsheets/d/1GU1oKIb9E0Vvwye6zRB2F_fT2jGzRvJ0WoLtWKuio-E/gviz/tq?tqx=out:json&gid=1744634045',
        HISTORIAL: 'https://docs.google.com/spreadsheets/d/1ohT8rfNsG4h7JjPZllHoyrxePutKsv2Q-5mBeUozia0/gviz/tq?tqx=out:json&gid=1185155654',
        GOOGLE_FORM: 'https://docs.google.com/forms/d/e/1FAIpQLSfe3gplfkjNe3qEjC5l_Jqhsrk_zPSdQM_Wg0M6BUhoHtj9tg/formResponse'
    },
    FORM_ENTRIES: {
        equipo: 'entry.1834514522',
        nombreCompleto: 'entry.1486223911',
        documento: 'entry.1695051506',
        curso: 'entry.564849635',
        telefono: 'entry.414930075',
        profesorEncargado: 'entry.116949605',
        materia: 'entry.1714096158',
        tipo: 'entry.801360829',
        comentario: 'entry.43776270'
    },
    SYNC_INTERVAL: 30000,
    FORM_DELAY: 1500,
    TOTAL_EQUIPOS: 40,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
};

// Estado global optimizado
const state = {
    personas: new Map(),
    historial: [],
    isLoading: false,
    syncIntervalId: null,
    lastSyncTime: 0,

    setPersonas(arr) {
        this.personas.clear();
        arr.forEach(p => {
            if (p.documento && this.isValidDoc(p.documento)) {
                this.personas.set(p.documento, p);
            }
        });
    },

    findPersona(doc) {
        return this.personas.get(doc) || null;
    },

    addHistorial(entry) {
        const newEntry = { ...entry, marcaTemporal: new Date() };
        this.historial.unshift(newEntry);
        return newEntry;
    },

    setHistorial(arr) {
        this.historial = arr
            .filter(h => h.equipo && h.tipo)
            .sort((a, b) => new Date(b.marcaTemporal) - new Date(a.marcaTemporal));
    },

    getEquipoState(num) {
        const movs = this.historial.filter(h => h.equipo === num.toString());
        if (!movs.length) return { prestado: false };

        const ultimo = movs[0];
        return {
            prestado: ultimo.tipo === 'Préstamo',
            ultimoMovimiento: ultimo,
            nombreCompleto: ultimo.nombreCompleto
        };
    },

    isValidDoc(doc) {
        return /^\d+$/.test(doc?.toString()?.trim());
    }
};

// Utilidades optimizadas
const utils = {
    parseGoogleResponse(text) {
        try {
            const cleaned = text.substring(text.indexOf('(') + 1, text.lastIndexOf(')'));
            return JSON.parse(cleaned);
        } catch (e) {
            console.error('❌ Error fatal inicializando:', e);
            alert(`Error crítico: ${e.message}`);
        }
    }
};

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, iniciando aplicación...');
    app.init();
});

// Limpieza al cerrar la ventana
window.addEventListener('beforeunload', () => {
    if (state.syncIntervalId) {
        clearInterval(state.syncIntervalId);
        console.log('🧹 Intervalos de sincronización limpiados');
    }
});

// Exportar API pública
window.EquipmentLoanSystem = {
    state,
    modal,
    debug,
    reload: () => location.reload(),
    version: '2.3.0'
};

console.log('📦 Sistema de Préstamo v2.3 - Validación y Auto-completado Optimizado');
            throw new Error('Error parsing Google Sheets response');
        }
    },

    getCellValue(cell) {
        if (!cell || cell.v === null || cell.v === undefined) return '';
        return typeof cell.v === 'string' ? cell.v.trim() : String(cell.v).trim();
    },

    formatDateTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    },

    async retryAsync(fn, attempts = CONFIG.RETRY_ATTEMPTS) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (e) {
                if (i === attempts - 1) throw e;
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * Math.pow(2, i)));
            }
        }
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// UI mejorada (solo mensajes críticos)
const ui = {
    showSync(msg, type = 'info', autoHide = true) {
        // Solo mostrar errores críticos y éxitos de operaciones
        if (type !== 'success' && type !== 'error') return;
        
        const el = document.getElementById('sync-status');
        if (!el) return;

        el.textContent = msg;
        el.className = `sync-status sync-${type}`;
        el.style.display = 'block';

        if (autoHide) {
            setTimeout(() => el.style.display = 'none', 3000);
        }
    }
};

// Modal completamente reescrito
const modal = {
    el: null,
    currentEquipo: null,

    init() {
        this.el = document.getElementById('modalMetodos');
        if (!this.el) return;

        this.el.addEventListener('click', (e) => {
            if (e.target === this.el) this.close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
    },

    isOpen() {
        return this.el && this.el.style.display === 'block';
    },

    open(equipoNum) {
        if (!this.el) return;

        this.currentEquipo = equipoNum;
        this.el.style.display = 'block';

        const header = this.el.querySelector('.modal-header h2');
        if (header) header.textContent = `Equipo ${equipoNum}`;

        this.renderContent();

        setTimeout(() => {
            const firstInput = this.el.querySelector('input:not([readonly]), textarea, select');
            if (firstInput) firstInput.focus();
        }, 100);
    },

    close() {
        if (this.el) {
            this.el.style.display = 'none';
            this.currentEquipo = null;
        }
    },

    renderContent() {
        const container = document.getElementById('listaMetodos');
        if (!container) return;

        const estado = state.getEquipoState(this.currentEquipo);
        const isPrestado = estado.prestado;

        container.innerHTML = isPrestado 
            ? this.generateReturnForm(estado.ultimoMovimiento)
            : this.generateLoanForm();

        this.setupFormEvents();
    },

    generateLoanForm() {
        return `
            <form id="equipmentForm" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label for="documento" style="font-weight: bold;">Documento del Estudiante:</label>
                    <input type="text" 
                           id="documento" 
                           name="documento" 
                           required 
                           autocomplete="off"
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                           placeholder="Ingrese el documento del estudiante">
                    <div id="documento-error" style="color: #dc3545; font-size: 12px; display: none;"></div>
                    <div id="documento-info" style="color: #28a745; font-size: 12px; display: none;"></div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label for="profesorEncargado" style="font-weight: bold;">Profesor Encargado:</label>
                    <input type="text" 
                           id="profesorEncargado" 
                           name="profesorEncargado" 
                           required 
                           autocomplete="off"
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                           placeholder="Nombre del profesor">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label for="materia" style="font-weight: bold;">Asignatura:</label>
                    <input type="text" 
                           id="materia" 
                           name="materia" 
                           required 
                           autocomplete="off"
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                           placeholder="Asignatura para la cual se usa">
                </div>

                <input type="hidden" id="tipo" name="tipo" value="Préstamo">
                <input type="hidden" id="nombreCompleto" name="nombreCompleto">
                <input type="hidden" id="curso" name="curso">
                <input type="hidden" id="telefono" name="telefono">

                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button type="button" 
                            onclick="modal.close()" 
                            style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit" 
                            id="submitBtn"
                            disabled
                            style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; opacity: 0.6;">
                        Registrar Préstamo
                    </button>
                </div>
            </form>
        `;
    },

    generateReturnForm(ultimoMovimiento) {
        return `
            <form id="equipmentForm" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Documento:</label>
                    <input type="text" 
                           value="${ultimoMovimiento.documento || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Estudiante:</label>
                    <input type="text" 
                           value="${ultimoMovimiento.nombreCompleto || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Curso:</label>
                    <input type="text" 
                           value="${ultimoMovimiento.curso || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Profesor Encargado:</label>
                    <input type="text" 
                           value="${ultimoMovimiento.profesorEncargado || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Asignatura:</label>
                    <input type="text" 
                           value="${ultimoMovimiento.materia || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label for="comentario" style="font-weight: bold;">Comentario (opcional):</label>
                    <textarea id="comentario" 
                              name="comentario" 
                              rows="3" 
                              style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; resize: vertical;"
                              placeholder="Observaciones sobre el estado del equipo"></textarea>
                </div>

                <!-- Campos ocultos para envío -->
                <input type="hidden" name="nombreCompleto" value="${ultimoMovimiento.nombreCompleto || ''}">
                <input type="hidden" name="documento" value="${ultimoMovimiento.documento || ''}">
                <input type="hidden" name="curso" value="${ultimoMovimiento.curso || ''}">
                <input type="hidden" name="telefono" value="${ultimoMovimiento.telefono || ''}">
                <input type="hidden" name="profesorEncargado" value="${ultimoMovimiento.profesorEncargado || ''}">
                <input type="hidden" name="materia" value="${ultimoMovimiento.materia || ''}">
                <input type="hidden" name="tipo" value="Devolución">

                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button type="button" 
                            onclick="modal.close()" 
                            style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Cancelar
                    </button>
                    <button type="submit" 
                            style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Registrar Devolución
                    </button>
                </div>
            </form>
        `;
    },

    setupFormEvents() {
        const form = document.getElementById('equipmentForm');
        if (!form) return;

        // Validación en tiempo real del documento
        const docInput = document.getElementById('documento');
        if (docInput && !docInput.readOnly) {
            const validateDocument = utils.debounce((doc) => {
                const errorEl = document.getElementById('documento-error');
                const infoEl = document.getElementById('documento-info');
                const submitBtn = document.getElementById('submitBtn');

                if (!doc) {
                    this.resetDocumentValidation();
                    return;
                }

                if (!state.isValidDoc(doc)) {
                    this.showDocumentError('El documento debe contener solo números');
                    return;
                }

                const persona = state.findPersona(doc);
                if (!persona) {
                    this.showDocumentError('Documento no encontrado en la base de datos');
                    return;
                }

                // Documento válido - autocompletar
                this.showDocumentSuccess(`Estudiante: ${persona.nombreCompleto} - ${persona.curso}`);
                this.fillHiddenFields(persona);
                
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                }
            }, 500);

            docInput.addEventListener('input', (e) => {
                const doc = e.target.value.trim();
                validateDocument(doc);
            });
        }

        // Envío del formulario
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);
            data.equipo = this.currentEquipo.toString();

            // Validación final para préstamos
            if (data.tipo === 'Préstamo') {
                if (!state.findPersona(data.documento)) {
                    ui.showSync('Documento no válido', 'error');
                    return;
                }
            }

            try {
                const submitBtn = form.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Enviando...';

                await forms.submit(data);
                
                // Agregar al historial local inmediatamente
                const newEntry = state.addHistorial(data);
                grid.updateAll();
                
                ui.showSync('Registro exitoso', 'success');
                this.close();
                
            } catch (error) {
                console.error('Error al enviar:', error);
                ui.showSync('Error al registrar', 'error');
                
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        });

        form.addEventListener('click', (e) => e.stopPropagation());
    },

    showDocumentError(message) {
        const errorEl = document.getElementById('documento-error');
        const infoEl = document.getElementById('documento-info');
        const submitBtn = document.getElementById('submitBtn');
        
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
        if (infoEl) infoEl.style.display = 'none';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
        }
    },

    showDocumentSuccess(message) {
        const errorEl = document.getElementById('documento-error');
        const infoEl = document.getElementById('documento-info');
        
        if (errorEl) errorEl.style.display = 'none';
        if (infoEl) {
            infoEl.textContent = message;
            infoEl.style.display = 'block';
        }
    },

    resetDocumentValidation() {
        const errorEl = document.getElementById('documento-error');
        const infoEl = document.getElementById('documento-info');
        const submitBtn = document.getElementById('submitBtn');
        
        if (errorEl) errorEl.style.display = 'none';
        if (infoEl) infoEl.style.display = 'none';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
        }
        
        this.clearHiddenFields();
    },

    fillHiddenFields(persona) {
        const fields = ['nombreCompleto', 'curso', 'telefono'];
        fields.forEach(field => {
            const input = document.getElementById(field);
            if (input) input.value = persona[field] || '';
        });
    },

    clearHiddenFields() {
        const fields = ['nombreCompleto', 'curso', 'telefono'];
        fields.forEach(field => {
            const input = document.getElementById(field);
            if (input) input.value = '';
        });
    }
};

// Cargador de datos optimizado
const loader = {
    async loadPersonas() {
        const resp = await fetch(CONFIG.URLS.PERSONAS);
        if (!resp.ok) throw new Error(`Error HTTP ${resp.status}`);
        
        const data = utils.parseGoogleResponse(await resp.text());
        const personas = data.table.rows.slice(1)
            .map(row => ({
                nombreCompleto: utils.getCellValue(row.c[1]),
                documento: utils.getCellValue(row.c[2]),
                curso: utils.getCellValue(row.c[3]),
                telefono: utils.getCellValue(row.c[4])
            }))
            .filter(p => p.documento && p.nombreCompleto);
        
        state.setPersonas(personas);
        console.log(`✓ Personas cargadas: ${state.personas.size}`);
    },

    async loadHistorial() {
        const resp = await fetch(CONFIG.URLS.HISTORIAL);
        if (!resp.ok) throw new Error(`Error HTTP ${resp.status}`);
        
        const data = utils.parseGoogleResponse(await resp.text());
        const historial = data.table.rows.slice(1)
            .map(row => ({
                marcaTemporal: new Date(utils.getCellValue(row.c[0]) || Date.now()),
                equipo: utils.getCellValue(row.c[1]),
                nombreCompleto: utils.getCellValue(row.c[2]),
                documento: utils.getCellValue(row.c[3]),
                curso: utils.getCellValue(row.c[4]),
                telefono: utils.getCellValue(row.c[5]),
                profesorEncargado: utils.getCellValue(row.c[6]),
                materia: utils.getCellValue(row.c[7]),
                tipo: utils.getCellValue(row.c[8]),
                comentario: utils.getCellValue(row.c[9])
            }))
            .filter(h => h.equipo && h.tipo);
        
        state.setHistorial(historial);
        console.log(`✓ Historial cargado: ${state.historial.length} registros`);
    },

    async loadAll() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        const startTime = Date.now();

        try {
            await Promise.all([
                utils.retryAsync(() => this.loadPersonas()),
                utils.retryAsync(() => this.loadHistorial())
            ]);
            
            grid.updateAll();
            state.lastSyncTime = Date.now();
            
            // Solo log en consola, no mensaje visual
            console.log(`✓ Sincronización completa en ${Date.now() - startTime}ms`);
            
        } catch (e) {
            console.error('Error en sincronización:', e);
            ui.showSync('Error de conexión', 'error');
        } finally {
            state.isLoading = false;
        }
    }
};

// Grid optimizado
const grid = {
    create() {
        const malla = document.getElementById('malla');
        if (!malla) {
            console.error('Elemento "malla" no encontrado');
            return;
        }

        const frag = document.createDocumentFragment();
        
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const div = document.createElement('div');
            div.className = 'ramo';
            div.dataset.equipo = i;
            
            div.onclick = () => modal.open(i);
            
            // Effectos hover optimizados
            div.onmouseenter = function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                this.style.transition = 'all 0.2s ease';
            };
            
            div.onmouseleave = function() {
                this.style.transform = '';
                this.style.boxShadow = '';
            };

            div.innerHTML = `
                <div style="font-weight:bold; margin-bottom: 5px;">Equipo ${i}</div>
                <div class="estado-equipo" style="font-size:0.9em; color: #666;">Disponible</div>
            `;
            
            frag.appendChild(div);
        }

        malla.innerHTML = '';
        malla.appendChild(frag);
        console.log(`✓ Grid creado: ${CONFIG.TOTAL_EQUIPOS} equipos`);
    },

    updateAll() {
        const updates = [];
        
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const el = document.querySelector(`[data-equipo="${i}"]`);
            const statusEl = el?.querySelector('.estado-equipo');
            if (!el || !statusEl) continue;

            const estado = state.getEquipoState(i);
            
            // Reset classes
            el.className = 'ramo';
            
            if (estado.prestado) {
                el.classList.add('equipo-prestado');
                Object.assign(el.style, {
                    backgroundColor: '#d4edda',
                    borderColor: '#28a745',
                    color: '#155724'
                });
                statusEl.textContent = `Prestado a: ${estado.nombreCompleto}`;
                statusEl.style.color = '#155724';
                updates.push(`Equipo ${i}: ${estado.nombreCompleto}`);
            } else {
                el.classList.add('equipo-disponible');
                Object.assign(el.style, {
                    backgroundColor: '#f8f9fa',
                    borderColor: '#dee2e6',
                    color: '#495057'
                });
                statusEl.textContent = 'Disponible';
                statusEl.style.color = '#666';
            }
        }
        
        if (updates.length > 0) {
            console.log('✓ Estados actualizados:', updates.length, 'cambios');
        }
    }
};

// Sistema de formularios mejorado
const forms = {
    async submit(data) {
        const formData = new URLSearchParams();
        
        // Mapear campos con validación
        Object.entries(CONFIG.FORM_ENTRIES).forEach(([key, entry]) => {
            const value = data[key];
            if (value) {
                formData.append(entry, value);
            }
        });

        console.log('Enviando datos:', Object.fromEntries(formData));

        const resp = await fetch(CONFIG.URLS.GOOGLE_FORM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
            mode: 'no-cors'
        });

        // Esperar para asegurar procesamiento
        await new Promise(resolve => setTimeout(resolve, CONFIG.FORM_DELAY));
        return true;
    }
};

// Eventos globales
const events = {
    init() {
        modal.init();
    },

    setupSync() {
        // Sincronización silenciosa cada 30 segundos
        state.syncIntervalId = setInterval(async () => {
            if (!state.isLoading) {
                try {
                    await loader.loadAll();
                } catch (e) {
                    console.warn('Sync failed silently:', e);
                }
            }
        }, CONFIG.SYNC_INTERVAL);
    }
};

// Debug API mejorada
const debug = {
    get state() { return state; },
    get config() { return CONFIG; },
    
    personas: () => {
        console.table([...state.personas.values()]);
        return state.personas.size;
    },
    
    historial: () => {
        console.table(state.historial.slice(0, 20)); // Solo los últimos 20
        return state.historial.length;
    },
    
    prestados() {
        const prestados = [];
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const estado = state.getEquipoState(i);
            if (estado.prestado) {
                prestados.push({
                    equipo: i,
                    estudiante: estado.nombreCompleto,
                    documento: estado.ultimoMovimiento?.documento,
                    fecha: utils.formatDateTime(estado.ultimoMovimiento?.marcaTemporal)
                });
            }
        }
        console.table(prestados);
        return prestados.length;
    },
    
    findDocument: (doc) => {
        const persona = state.findPersona(doc);
        if (persona) {
            console.log('Encontrado:', persona);
        } else {
            console.log('Documento no encontrado:', doc);
        }
        return persona;
    },
    
    testValidation: (doc) => {
        console.log('Documento:', doc);
        console.log('Es válido:', state.isValidDoc(doc));
        console.log('Existe en BD:', !!state.findPersona(doc));
        return { valid: state.isValidDoc(doc), exists: !!state.findPersona(doc) };
    },
    
    sync: () => loader.loadAll(),
    
    reset: () => {
        if (confirm('¿Resetear vista local?')) {
            state.setHistorial([]);
            grid.updateAll();
            console.log('Vista reseteada');
        }
    }
};

// Inicialización de la aplicación
const app = {
    async init() {
        console.log('🚀 Iniciando Sistema de Préstamos v2.3...');
        
        try {
            // Verificar elementos DOM
            const required = ['malla', 'modalMetodos'];
            const missing = required.filter(id => !document.getElementById(id));
            
            if (missing.length) {
                throw new Error(`Elementos DOM faltantes: ${missing.join(', ')}`);
            }

            // Inicializar componentes
            grid.create();
            events.init();
            events.setupSync();
            
            // Cargar datos iniciales
            try {
                await loader.loadAll();
                console.log('✅ Sistema inicializado correctamente');
                
                // Estadísticas iniciales
                console.log(`📊 Personas: ${state.personas.size}, Historial: ${state.historial.length}`);
                
            } catch (e) {
                console.warn('⚠️ Error cargando datos iniciales:', e);
                console.log('🔄 Continuando en modo offline...');
            }

            // Exponer API de debug
            window.debug = debug;
            window.EquipmentLoanSystem = { state, modal, debug, version: '2.3.0' };
            
        } catch (e) {
