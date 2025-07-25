const CONFIG = {
    URLS: {
        PERSONAS: 'https://docs.google.com/spreadsheets/d/1GU1oKIb9E0Vvwye6zRB2F_fT2jGzRvJ0WoLtWKuio-E/gviz/tq?tqx=out:json&gid=1744634045',
        HISTORIAL: 'https://docs.google.com/spreadsheets/d/1ohT8rfNsG4h7JjPZllHoyrxePutKsv2Q-5mBeUozia0/gviz/tq?tqx=out:json&gid=1185155654',
        GOOGLE_FORM: 'https://docs.google.com/forms/d/e/1FAIpQLSfe3gplfkjNe3qEjC5l_Jqhsrk_zPSdQM_Wg0M6BUhoHtj9tg/formResponse',
        URL_WEB_APP: 'https://script.google.com/macros/s/AKfycbxCr0EnWrwO8TE1fgBK5aJ7yX--LAfJJi_pPn2quK9ug8kfU2h0V4-DQNiYgDyxDwC-/exec'
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
    FORM_DELAY: 15000, 
    TOTAL_EQUIPOS: 40, 
    RETRY_ATTEMPTS: 3, 
    RETRY_DELAY: 1000
};

// Estado global
const state = {
    personas: new Map(),
    historial: [],
    isLoading: false,
    syncIntervalId: null,

    setPersonas(arr) { 
        this.personas.clear(); 
        arr.forEach(p => p.documento && this.personas.set(p.documento, p)); 
    },
    findPersona(doc) { return this.personas.get(doc) || null; },
    addHistorial(entry) { this.historial.unshift({...entry, marcaTemporal: new Date()}); },
    removeHistorial(entry) { 
        const i = this.historial.indexOf(entry); 
        if(i > -1) this.historial.splice(i, 1); 
    },
    setHistorial(arr) { 
        this.historial = arr.sort((a, b) => b.marcaTemporal - a.marcaTemporal); 
    },

    getEquipoState(num) {
        const movs = this.historial.filter(h => h.equipo === num.toString());
        if (!movs.length) return {prestado: false};
        const ultimo = movs[0];
        return {
            prestado: ultimo.tipo === 'Préstamo', 
            ultimoMovimiento: ultimo, 
            nombreCompleto: ultimo.nombreCompleto
        };
    }
};

// Utilidades
const utils = {
    parseGoogleResponse(text) {
        const cleaned = text.substring(text.indexOf('(')+1, text.lastIndexOf(')'));
        return JSON.parse(cleaned);
    },

    getCellValue(cell) {
        return cell && cell.v !== null && cell.v !== undefined ? 
               (typeof cell.v === 'string' ? cell.v.trim() : String(cell.v)) : '';
    },

    isValidDoc(doc) {
        return /^\d+$/.test(doc);
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
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY));
            }
        }
    }
};

// UI
const ui = {
    showSync(msg, type = 'info', autoHide = true) {
        const el = document.getElementById('sync-status');
        if (!el) return;
        
        el.textContent = msg;
        el.className = `sync-status sync-${type}`;
        el.style.display = 'block';
        
        if (autoHide) setTimeout(() => el.style.display = 'none', 3000);
    }
};

// Modal mejorado con formularios específicos para préstamo y devolución
const modal = {
    el: null,
    currentEquipo: null,
    
    init() {
        this.el = document.getElementById('modalMetodos');
        
        // Eventos del modal
        this.el.addEventListener('click', (e) => {
            if (e.target === this.el) this.close();
        });
        
        // Soporte para tecla Escape
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
        
        // Actualizar título
        const header = this.el.querySelector('.modal-header h2');
        if (header) header.textContent = `Equipo ${equipoNum}`;
        
        this.renderContent();
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
        const isDevolucion = estado.prestado;

        // Formulario para préstamo (campos editables)
        if (!isDevolucion) {
            container.innerHTML = `
                <form id="equipmentForm" style="display: flex; flex-direction: column; gap: 15px;">
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <label for="documento" style="font-weight: bold;">Documento:</label>
                        <input type="text" 
                               id="documento" 
                               name="documento" 
                               required 
                               autocomplete="off"
                               style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                               placeholder="Ingrese el documento del estudiante">
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <label for="profesorEncargado" style="font-weight: bold;">Profesor Encargado:</label>
                        <input type="text" 
                               id="profesorEncargado" 
                               name="profesorEncargado" 
                               required 
                               autocomplete="off"
                               style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                               placeholder="Nombre del profesor responsable">
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <label for="materia" style="font-weight: bold;">Asignatura:</label>
                        <input type="text" 
                               id="materia" 
                               name="materia" 
                               required 
                               autocomplete="off"
                               style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                               placeholder="Asignatura para la cual se usa el equipo">
                    </div>

                    <!-- Campos ocultos que se llenan automáticamente -->
                    <input type="hidden" id="nombreCompleto" name="nombreCompleto">
                    <input type="hidden" id="curso" name="curso">
                    <input type="hidden" id="telefono" name="telefono">
                    <input type="hidden" id="tipo" name="tipo" value="Préstamo">

                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button type="button" 
                                onclick="modal.close()" 
                                style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Cancelar
                        </button>
                        <button type="submit" 
                                style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Registrar Préstamo
                        </button>
                    </div>
                </form>
            `;
        } 
        // Formulario para devolución (campos no editables + comentario)
        else {
            const ultimoMov = estado.ultimoMovimiento;
            container.innerHTML = `
                <form id="equipmentForm" style="display: flex; flex-direction: column; gap: 15px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; border: 1px solid #dee2e6;">
                        <h4 style="margin: 0 0 10px 0; color: #495057;">Información del Préstamo Actual:</h4>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <div>
                                <strong>Documento:</strong><br>
                                <span style="color: #6c757d;">${ultimoMov?.documento || 'N/A'}</span>
                            </div>
                            <div>
                                <strong>Estudiante:</strong><br>
                                <span style="color: #6c757d;">${ultimoMov?.nombreCompleto || 'N/A'}</span>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <div>
                                <strong>Profesor:</strong><br>
                                <span style="color: #6c757d;">${ultimoMov?.profesorEncargado || 'N/A'}</span>
                            </div>
                            <div>
                                <strong>Asignatura:</strong><br>
                                <span style="color: #6c757d;">${ultimoMov?.materia || 'N/A'}</span>
                            </div>
                        </div>
                        
                        <div>
                            <strong>Fecha de Préstamo:</strong><br>
                            <span style="color: #6c757d;">${utils.formatDateTime(ultimoMov?.marcaTemporal)}</span>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <label for="comentario" style="font-weight: bold;">Comentario sobre la Devolución:</label>
                        <textarea id="comentario" 
                                  name="comentario" 
                                  rows="4" 
                                  style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; resize: vertical;"
                                  placeholder="Observaciones sobre el estado del equipo, problemas encontrados, etc."></textarea>
                    </div>

                    <!-- Campos ocultos con datos del préstamo original -->
                    <input type="hidden" id="documento" name="documento" value="${ultimoMov?.documento || ''}">
                    <input type="hidden" id="nombreCompleto" name="nombreCompleto" value="${ultimoMov?.nombreCompleto || ''}">
                    <input type="hidden" id="curso" name="curso" value="${ultimoMov?.curso || ''}">
                    <input type="hidden" id="telefono" name="telefono" value="${ultimoMov?.telefono || ''}">
                    <input type="hidden" id="profesorEncargado" name="profesorEncargado" value="${ultimoMov?.profesorEncargado || ''}">
                    <input type="hidden" id="materia" name="materia" value="${ultimoMov?.materia || ''}">
                    <input type="hidden" id="tipo" name="tipo" value="Devolución">

                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button type="button" 
                                onclick="modal.close()" 
                                style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Cancelar
                        </button>
                        <button type="submit" 
                                style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Registrar Devolución
                        </button>
                    </div>
                </form>
            `;
        }

        // Configurar eventos del formulario
        this.setupFormEvents();
        
        // Establecer foco apropiado
        setTimeout(() => {
            let firstInput;
            if (!isDevolucion) {
                firstInput = this.el.querySelector('#documento');
            } else {
                firstInput = this.el.querySelector('#comentario');
            }
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    },

    setupFormEvents() {
        const form = document.getElementById('equipmentForm');
        if (!form) return;

        const estado = state.getEquipoState(this.currentEquipo);
        const isDevolucion = estado.prestado;

        // Evento de envío del formulario
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);
            data.equipo = this.currentEquipo;
            data.marcaTemporal = new Date().toISOString();

            // Para préstamos, validar que el documento exista en la base de personas
            if (!isDevolucion) {
                const persona = state.findPersona(data.documento);
                if (!persona) {
                    ui.showSync('Documento no encontrado en la base de datos', 'error');
                    return;
                }
                
                // Llenar automáticamente los datos de la persona
                data.nombreCompleto = persona.nombreCompleto;
                data.curso = persona.curso;
                data.telefono = persona.telefono;
            }

            try {
                const submitBtn = form.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Enviando...';

                await forms.submit(data);
                
                ui.showSync(`${data.tipo} registrado exitosamente`, 'success');
                this.close();
                
                // Actualizar estado local
                state.addHistorial(data);
                grid.updateAll();
                
            } catch (error) {
                console.error('Error al enviar:', error);
                ui.showSync('Error al registrar', 'error');
            }
        });

        // Solo para préstamos: evento de búsqueda automática por documento
        if (!isDevolucion) {
            const docInput = document.getElementById('documento');
            if (docInput) {
                docInput.addEventListener('input', (e) => {
                    const doc = e.target.value.trim();
                    if (doc && utils.isValidDoc(doc)) {
                        const persona = state.findPersona(doc);
                        if (persona) {
                            // Mostrar información de validación visual
                            docInput.style.borderColor = '#28a745';
                            docInput.style.backgroundColor = '#d4edda';
                            docInput.title = `${persona.nombreCompleto} - ${persona.curso}`;
                        } else {
                            docInput.style.borderColor = '#dc3545';
                            docInput.style.backgroundColor = '#f8d7da';
                            docInput.title = 'Documento no encontrado en la base de datos';
                        }
                    } else {
                        docInput.style.borderColor = '#ccc';
                        docInput.style.backgroundColor = 'white';
                        docInput.title = '';
                    }
                });
            }
        }

        // Prevenir que el modal se cierre cuando se hace clic en los inputs
        form.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
};

// Cargador de datos
const loader = {
    async loadPersonas() {
        const resp = await fetch(CONFIG.URLS.PERSONAS);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        
        const data = utils.parseGoogleResponse(await resp.text());
        const personas = data.table.rows.slice(1)
            .map(row => ({
                nombreCompleto: utils.getCellValue(row.c[1]),
                documento: utils.getCellValue(row.c[2]),
                curso: utils.getCellValue(row.c[3]),
                telefono: utils.getCellValue(row.c[4])
            }))
            .filter(p => p.documento && utils.isValidDoc(p.documento));
        
        state.setPersonas(personas);
        console.log(`✓ Personas: ${state.personas.size}`);
    },

    async loadHistorial() {
        const resp = await fetch(CONFIG.URLS.HISTORIAL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        
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
        console.log(`✓ Historial: ${state.historial.length}`);
    },

    async loadAll() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        ui.showSync('Sincronizando...', 'info', false);

        try {
            await Promise.all([
                utils.retryAsync(() => this.loadPersonas()),
                utils.retryAsync(() => this.loadHistorial())
            ]);
            
            grid.updateAll();
            ui.showSync('Sincronizado', 'success');
        } catch (e) {
            console.error('Error en sincronización:', e);
            ui.showSync('Error de sincronización', 'error');
        } finally {
            state.isLoading = false;
        }
    }
};

// Grid de equipos
const grid = {
    create() {
        const malla = document.getElementById('malla');
        if (!malla) {
            console.error('No se encontró el elemento con id "malla"');
            return;
        }

        console.log('Creando malla de equipos...');
        const frag = document.createDocumentFragment();
        
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const div = document.createElement('div');
            div.className = 'ramo';
            div.dataset.equipo = i;
            
            div.onclick = () => modal.open(i);
            
            div.onmouseenter = function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            };
            
            div.onmouseleave = function() {
                this.style.transform = this.style.boxShadow = '';
            };

            div.innerHTML = `
                <div style="font-weight:bold">Equipo ${i}</div>
                <div class="estado-equipo" style="font-size:0.9em;margin-top:5px">Disponible</div>
            `;
            frag.appendChild(div);
        }

        malla.innerHTML = '';
        malla.appendChild(frag);
        console.log(`✓ Creados ${CONFIG.TOTAL_EQUIPOS} equipos`);
    },

    updateAll() {
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const el = document.querySelector(`[data-equipo="${i}"]`);
            const statusEl = el?.querySelector('.estado-equipo');
            if (!el) continue;

            const estado = state.getEquipoState(i);
            el.className = 'ramo';

            if (estado.prestado) {
                el.classList.add('equipo-prestado');
                Object.assign(el.style, {
                    backgroundColor: '#d4edda', 
                    borderColor: '#28a745', 
                    color: '#155724'
                });
                if (statusEl) statusEl.textContent = `Prestado a: ${estado.nombreCompleto}`;
            } else {
                el.classList.add('equipo-disponible');
                Object.assign(el.style, {
                    backgroundColor: '#f8f9fa', 
                    borderColor: '#dee2e6', 
                    color: '#495057'
                });
                if (statusEl) statusEl.textContent = 'Disponible';
            }
        }
        console.log('✓ Estados actualizados');
    }
};

// Sistema de formularios
const forms = {
    async submit(data) {
        const formData = new URLSearchParams();
        
        Object.entries(CONFIG.FORM_ENTRIES).forEach(([key, entry]) => {
            if (data[key]) formData.append(entry, data[key]);
        });

        const resp = await fetch(CONFIG.URLS.GOOGLE_FORM, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: formData,
            mode: 'no-cors'
        });

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
        state.syncIntervalId = setInterval(() => {
            if (!state.isLoading) loader.loadAll();
        }, CONFIG.SYNC_INTERVAL);
    }
};

// Debug
const debug = {
    state: () => state,
    personas: () => console.table([...state.personas.values()]),
    historial: () => console.table(state.historial),
    prestados() {
        const prestados = [];
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const estado = state.getEquipoState(i);
            if (estado.prestado) {
                prestados.push({
                    equipo: i,
                    prestadoA: estado.nombreCompleto,
                    fecha: utils.formatDateTime(estado.ultimoMovimiento?.marcaTemporal)
                });
            }
        }
        console.table(prestados);
    },
    reset: () => {
        if (confirm('¿Resetear vista?')) {
            state.setHistorial([]);
            grid.updateAll();
        }
    },
    sync: () => loader.loadAll()
};

// Inicialización
const app = {
    async init() {
        console.log('🚀 Iniciando sistema...');
        
        try {
            const missing = ['malla', 'modalMetodos'].filter(id => !document.getElementById(id));
            if (missing.length) throw new Error(`Elementos faltantes: ${missing.join(', ')}`);

            console.log('✓ Elementos encontrados');
            
            grid.create();
            events.init();
            events.setupSync();
            
            // Intentar cargar datos, pero no fallar si no se puede
            try {
                await loader.loadAll();
            } catch (e) {
                console.warn('No se pudieron cargar datos iniciales:', e);
                ui.showSync('Sin conexión - modo offline', 'warning');
            }

            window.debug = debug;
            console.log('✅ Sistema inicializado correctamente');
        } catch (e) {
            console.error('❌ Error fatal:', e);
            alert(`Error inicializando sistema: ${e.message}`);
        }
    }
};

// Eventos de carga
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, iniciando aplicación...');
    app.init();
});

window.addEventListener('beforeunload', () => {
    if (state.syncIntervalId) clearInterval(state.syncIntervalId);
});

// API pública
window.EquipmentLoanSystem = {
    state,
    modal,
    debug,
    reload: () => location.reload(),
    version: '2.1.0'
};

console.log('📦 Sistema de Préstamo v2.1 - Formularios específicos para préstamo y devolución');
