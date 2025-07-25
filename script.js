// Sistema de Préstamo de Equipos - Versión Compacta
const CONFIG = {
    URLS: {
        PERSONAS: 'https://docs.google.com/spreadsheets/d/1GU1oKIb9E0Vvwye6zRB2F_fT2jGzRvJ0WoLtWKuio-E/gviz/tq?tqx=out:json&gid=1744634045',
        HISTORIAL: 'https://docs.google.com/spreadsheets/d/1ohT8rfNsG4h7JjPZllHoyrxePutKsv2Q-5mBeUozia0/gviz/tq?tqx=out:json&gid=1185155654',
        GOOGLE_FORM: 'https://docs.google.com/forms/d/e/1FAIpQLSfe3gplfkjNe3qEjC5l_Jqhsrk_zPSdQM_Wg0M6BUhoHtj9tg/formResponse'
    },
    FORM_ENTRIES: {
        equipo: 'entry.1834514522', nombreCompleto: 'entry.1486223911', documento: 'entry.1695051506',
        curso: 'entry.564849635', telefono: 'entry.414930075', profesorEncargado: 'entry.116949605',
        materia: 'entry.1714096158', tipo: 'entry.801360829', comentario: 'entry.43776270'
    },
    SYNC_INTERVAL: 30000, FORM_DELAY: 15000, TOTAL_EQUIPOS: 40, RETRY_ATTEMPTS: 3, RETRY_DELAY: 1000
};

// Estado global
const state = {
    personas: new Map(),
    historial: [],
    equipoSeleccionado: null,
    isLoading: false,
    syncIntervalId: null,
    
    setPersonas(arr) { this.personas.clear(); arr.forEach(p => p.documento && this.personas.set(p.documento, p)); },
    findPersona(doc) { return this.personas.get(doc) || null; },
    addHistorial(entry) { this.historial.unshift({...entry, marcaTemporal: new Date()}); },
    removeHistorial(entry) { const i = this.historial.indexOf(entry); if(i > -1) this.historial.splice(i, 1); },
    setHistorial(arr) { this.historial = arr.sort((a, b) => b.marcaTemporal - a.marcaTemporal); },
    
    getEquipoState(num) {
        const movs = this.historial.filter(h => h.equipo === num);
        if (!movs.length) return {prestado: false};
        const ultimo = movs[0];
        return {prestado: ultimo.tipo === 'Préstamo', ultimoMovimiento: ultimo, nombreCompleto: ultimo.nombreCompleto};
    }
};

// Utilidades
const utils = {
    parseGoogleResponse(text) {
        if (!text.startsWith('/*O_o*/\ngoogle.visualization.Query.setResponse(')) 
            throw new Error('Formato inválido');
        const json = text.substring(47).slice(0, -2);
        const data = JSON.parse(json);
        if (!data?.table?.rows) throw new Error('Estructura inválida');
        return data;
    },
    
    getCellValue: c => c && c.v !== null && c.v !== undefined ? c.v.toString().trim() : '',
    
    async retry(fn, attempts = CONFIG.RETRY_ATTEMPTS) {
        for (let i = 0; i < attempts; i++) {
            try { return await fn(); }
            catch (e) {
                if (i === attempts - 1) throw e;
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * Math.pow(2, i)));
            }
        }
    },
    
    debounce(fn, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    },
    
    isValidDoc: doc => doc && /^\d+$/.test(doc.trim()) && doc.trim().length >= 6
};

// UI Functions
const ui = {
    showSync(msg, type = 'info', autoHide = true) {
        // Filtrar mensajes de sincronización automática
        if (msg === 'Sincronizando...' || msg === '✓ Sincronizado') {
            return;
        }
        
        const el = document.getElementById('sync-status');
        if (!el) return console.log(`SYNC: ${msg} (${type})`);
        
        const colors = {success: '#28a745', error: '#dc3545', warning: '#ffc107', info: '#17a2b8'};
        el.textContent = msg;
        el.className = `sync-status ${type}`;
        el.style.color = colors[type];
        el.style.opacity = '1';
        
        if (autoHide && (type === 'success' || type === 'error')) {
            setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => { el.textContent = ''; el.className = 'sync-status'; }, 300);
            }, 4000);
        }
    },
    
    showModal(show = true) {
        const modal = document.getElementById('modalMetodos');
        if (!modal) return;
        
        modal.style.display = show ? 'block' : 'none';
        document.body.style.overflow = show ? 'hidden' : '';
        if (!show) state.equipoSeleccionado = null;
        if (show) {
            const input = modal.querySelector('input, button, textarea, select');
            if (input) input.focus();
        }
    },
    
    validateDoc: utils.debounce(function(doc) {
        const status = document.getElementById('documento-status');
        const btn = document.getElementById('btn-registrar');
        if (!status || !btn) return;
        
        if (!doc) {
            status.textContent = ''; status.className = '';
            btn.disabled = false; btn.style.opacity = '1';
            return;
        }
        
        if (!utils.isValidDoc(doc)) {
            status.textContent = '⚠ Formato inválido';
            status.className = 'warning'; status.style.color = '#ffc107';
            btn.disabled = true; btn.style.opacity = '0.6';
            return;
        }
        
        const persona = state.findPersona(doc);
        if (persona) {
            status.textContent = `✓ ${persona.nombreCompleto} - ${persona.curso}`;
            status.className = 'success'; status.style.color = '#28a745';
            btn.disabled = false; btn.style.opacity = '1';
        } else {
            status.textContent = `✗ No encontrado (${state.personas.size} registros)`;
            status.className = 'error'; status.style.color = '#dc3545';
            btn.disabled = true; btn.style.opacity = '0.6';
        }
    }, 300)
};

// Carga de datos
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
    const CONFIG = {
  URL_WEB_APP: 'https://script.google.com/macros/s/AKfycbxCr0EnWrwO8TE1fgBK5aJ7yX--LAfJJi_pPn2quK9ug8kfU2h0V4-DQNiYgDyxDwC-/exec',
  URLS: {
    HISTORIAL: 'https://script.google.com/macros/s/AKfycbxCr0EnWrwO8TE1fgBK5aJ7yX--LAfJJi_pPn2quK9ug8kfU2h0V4-DQNiYgDyxDwC-/exec?action=historial'
  }
};
    async loadHistorial() {
        const resp = await fetch(CONFIG.URLS.HISTORIAL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        
        const data = utils.parseGoogleResponse(await resp.text());
        const historial = data.table.rows.slice(1)
            .map(row => ({
                marcaTemporal: row.c[0]?.v ? new Date(row.c[0].v) : new Date(),
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
            .filter(h => h.equipo && ['Préstamo', 'Devolución'].includes(h.tipo));
        
        state.setHistorial(historial);
        console.log(`✓ Historial: ${historial.length}`);
    },
    
    async loadAll() {
        if (state.isLoading) return;
document.getElementById("registro-form").addEventListener("submit", function(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const datos = new URLSearchParams(formData);

  fetch(CONFIG.URL_WEB_APP, {
    method: "POST",
    body: datos
  })
  .then(response => response.text())
  .then(result => {
    document.getElementById("mensaje").textContent = "Registro exitoso.";
    e.target.reset(); // Limpia el formulario
    cargaHistorial(); // Recarga los datos
  })
  .catch(error => {
    console.error("Error al enviar:", error);
    document.getElementById("mensaje").textContent = "Error al registrar.";
  });
});

        state.isLoading = true;
        ui.showSync('Sincronizando...', 'info', false);
        
        try {
            await utils.retry(() => Promise.all([this.loadPersonas(), this.loadHistorial()]));
            grid.updateAll();
            ui.showSync('✓ Sincronizado', 'success');
        } catch (e) {
            console.error('Error:', e);
            ui.showSync('⚠ Error - usando datos locales', 'warning');
            try { grid.updateAll(); } catch {}
        } finally {
            state.isLoading = false;
        }
    }
};

// Malla de equipos
const grid = {
    create() {
        const malla = document.getElementById('malla');
        if (!malla) return;
        
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const div = document.createElement('div');
            div.className = 'ramo';
            div.dataset.equipo = i;
            div.style.cssText = 'cursor:pointer;transition:all 0.2s;user-select:none';
            div.onclick = () => modal.open(i);
            
            div.onmouseenter = function() {
                if (!this.classList.contains('equipo-prestado')) {
                    this.style.transform = 'scale(1.02)';
                    this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }
            };
            div.onmouseleave = function() {
                this.style.transform = this.style.boxShadow = '';
            };
            
            div.innerHTML = `<div style="font-weight:bold">Equipo ${i}</div><div class="estado-equipo" style="font-size:0.9em;margin-top:5px">Disponible</div>`;
            frag.appendChild(div);
        }
        
        malla.innerHTML = '';
        malla.appendChild(frag);
    },
    
    updateAll() {
        document.querySelectorAll('[data-equipo]').forEach(el => {
            const num = el.dataset.equipo;
            const estado = state.getEquipoState(num);
            const statusEl = el.querySelector('.estado-equipo');
            
            el.classList.remove('equipo-prestado', 'equipo-disponible');
            
            if (estado.prestado) {
                el.classList.add('equipo-prestado');
                Object.assign(el.style, {backgroundColor: '#d4edda', borderColor: '#28a745', color: '#155724'});
                if (statusEl) statusEl.textContent = `Prestado a: ${estado.nombreCompleto}`;
            } else {
                el.classList.add('equipo-disponible');
                Object.assign(el.style, {backgroundColor: '#f8f9fa', borderColor: '#dee2e6', color: '#495057'});
                if (statusEl) statusEl.textContent = 'Disponible';
            }
        });
    }
};

// Modal de equipos
const modal = {
    open(num) {
        state.equipoSeleccionado = num;
        const estado = state.getEquipoState(num.toString());
        
        const header = document.querySelector('#modalMetodos .modal-header h2');
        if (header) header.textContent = `Equipo ${num}`;
        
        estado.prestado ? this.showReturn(estado.ultimoMovimiento) : this.showLoan();
        ui.showModal(true);
    },
    
    showLoan() {
        const lista = document.getElementById('listaMetodos');
        if (!lista) return;
        
        lista.innerHTML = `
            <div class="formulario-prestamo" style="padding:20px">
                <div style="margin-bottom:15px">
                    <label for="documento" style="display:block;margin-bottom:5px;font-weight:bold">Documento: <span style="color:#dc3545">*</span></label>
                    <input type="text" id="documento" placeholder="Ej: 12345678" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:16px" autocomplete="off" inputmode="numeric" pattern="[0-9]*"/>
                    <small id="documento-status" style="display:block;margin-top:5px;font-size:0.85em"></small>
                </div>
                <div style="margin-bottom:15px">
                    <label for="profesor" style="display:block;margin-bottom:5px;font-weight:bold">Profesor(a): <span style="color:#dc3545">*</span></label>
                    <input type="text" id="profesor" placeholder="Nombre completo" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:16px"/>
                </div>
                <div style="margin-bottom:20px">
                    <label for="asignatura" style="display:block;margin-bottom:5px;font-weight:bold">Asignatura: <span style="color:#dc3545">*</span></label>
                    <input type="text" id="asignatura" placeholder="Nombre materia" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:16px"/>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:30px">
                    <button id="btn-registrar" onclick="loan.process()" style="background:#007bff;color:white;border:none;padding:12px 24px;border-radius:4px;cursor:pointer;font-size:16px">Registrar Préstamo</button>
                    <button onclick="modal.close()" style="background:#6c757d;color:white;border:none;padding:12px 24px;border-radius:4px;cursor:pointer;font-size:16px">Cancelar</button>
                </div>
            </div>`;
        
        setTimeout(() => {
            const docInput = document.getElementById('documento');
            if (docInput) {
                docInput.focus();
                docInput.oninput = e => ui.validateDoc(e.target.value.trim());
                docInput.onkeypress = e => {
                    if (!/\d/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter'].includes(e.key)) e.preventDefault();
                };
            }
            
            const form = document.querySelector('.formulario-prestamo');
            if (form) form.onkeypress = e => e.key === 'Enter' && !e.target.matches('textarea') && (e.preventDefault(), loan.process());
        }, 100);
    },
    
    showReturn(ultimo) {
        const lista = document.getElementById('listaMetodos');
        if (!lista) return;
        
        lista.innerHTML = `
            <div style="padding:20px">
                <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px;border-left:4px solid #007bff">
                    <h4 style="margin-top:0;color:#495057;margin-bottom:15px">📋 Información del Préstamo</h4>
                    <div style="display:grid;gap:8px">
                        <p style="margin:0"><strong>Nombre:</strong> ${ultimo.nombreCompleto}</p>
                        <p style="margin:0"><strong>Documento:</strong> ${ultimo.documento}</p>
                        <p style="margin:0"><strong>Curso:</strong> ${ultimo.curso}</p>
                        <p style="margin:0"><strong>Profesor:</strong> ${ultimo.profesorEncargado}</p>
                        <p style="margin:0"><strong>Asignatura:</strong> ${ultimo.materia}</p>
                        <p style="margin:0"><strong>Prestado:</strong> ${ultimo.marcaTemporal.toLocaleString()}</p>
                    </div>
                </div>
                <div style="margin-bottom:20px">
                    <label for="comentario-devolucion" style="display:block;margin-bottom:8px;font-weight:bold">💬 Comentarios (opcional):</label>
                    <textarea id="comentario-devolucion" placeholder="Estado del equipo, daños, observaciones..." style="width:100%;padding:12px;border:1px solid #ddd;border-radius:4px;min-height:100px;resize:vertical;font-family:inherit;font-size:14px"></textarea>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:30px">
                    <button onclick="returnProc.process()" style="background:#28a745;color:white;border:none;padding:12px 24px;border-radius:4px;cursor:pointer;font-size:16px">✓ Registrar Devolución</button>
                    <button onclick="modal.close()" style="background:#6c757d;color:white;border:none;padding:12px 24px;border-radius:4px;cursor:pointer;font-size:16px">Cancelar</button>
                </div>
            </div>`;
    },
    
    close() { ui.showModal(false); }
};

// Procesador de préstamos
const loan = {
    async process() {
        if (state.isLoading) return ui.showSync('Operación en progreso...', 'warning');
        
        const doc = document.getElementById('documento')?.value.trim();
        const prof = document.getElementById('profesor')?.value.trim();
        const asig = document.getElementById('asignatura')?.value.trim();
        
        if (!doc || !prof || !asig) return alert('Todos los campos son requeridos');
        if (!utils.isValidDoc(doc)) return alert('Documento inválido');
        if (prof.length < 3) return alert('Nombre de profesor muy corto');
        if (asig.length < 2) return alert('Nombre de asignatura muy corto');
        
        const persona = state.findPersona(doc);
        if (!persona) return alert(`Documento "${doc}" no registrado.\nPersonas: ${state.personas.size}`);
        
        const registro = {
            equipo: state.equipoSeleccionado.toString(),
            nombreCompleto: persona.nombreCompleto,
            documento: persona.documento,
            curso: persona.curso,
            telefono: persona.telefono,
            profesorEncargado: prof,
            materia: asig,
            tipo: 'Préstamo',
            comentario: ''
        };
        
        try { await this.submit(registro); }
        catch (e) { alert('Error registrando préstamo. Verifique conexión.'); }
    },
    
    async submit(reg) {
        ui.showSync('Registrando préstamo...', 'info', false);
        
        const mov = {marcaTemporal: new Date(), ...reg};
        state.addHistorial(mov);
        grid.updateAll();
        modal.close();
        
        try {
            await form.submit(reg);
            ui.showSync('✓ Préstamo registrado', 'success');
            setTimeout(() => loader.loadAll(), CONFIG.FORM_DELAY);
        } catch (e) {
            state.removeHistorial(mov);
            grid.updateAll();
            throw e;
        }
    }
};

// Procesador de devoluciones
const returnProc = {
    async process() {
        if (state.isLoading) return ui.showSync('Operación en progreso...', 'warning');
        
        const estado = state.getEquipoState(state.equipoSeleccionado.toString());
        if (!estado.ultimoMovimiento) return alert('Error: No hay información del préstamo');
        
        const comentario = document.getElementById('comentario-devolucion')?.value.trim() || '';
        const ultimo = estado.ultimoMovimiento;
        
        const registro = {
            equipo: state.equipoSeleccionado.toString(),
            nombreCompleto: ultimo.nombreCompleto,
            documento: ultimo.documento,
            curso: ultimo.curso,
            telefono: ultimo.telefono,
            profesorEncargado: ultimo.profesorEncargado,
            materia: ultimo.materia,
            tipo: 'Devolución',
            comentario
        };
        
        try { await this.submit(registro); }
        catch (e) { alert('Error registrando devolución. Verifique conexión.'); }
    },
    
    async submit(reg) {
        ui.showSync('Registrando devolución...', 'info', false);
        
        const mov = {marcaTemporal: new Date(), ...reg};
        state.addHistorial(mov);
        grid.updateAll();
        modal.close();
        
        try {
            await form.submit(reg);
            ui.showSync('✓ Devolución registrada', 'success');
            setTimeout(() => loader.loadAll(), CONFIG.FORM_DELAY);
        } catch (e) {
            state.removeHistorial(mov);
            grid.updateAll();
            throw e;
        }
    }
};

// Envío de formularios
const form = {
    async submit(reg) {
        const formData = new FormData();
        Object.entries(CONFIG.FORM_ENTRIES).forEach(([key, entryId]) => {
            formData.append(entryId, reg[key] || '');
        });
        
        try {
            await fetch(CONFIG.URLS.GOOGLE_FORM, {method: 'POST', mode: 'no-cors', body: formData});
            console.log('✓ Enviado a Google Forms');
        } catch (e) {
            console.error('Error:', e);
            throw new Error('No se pudo enviar');
        }
    }
};

// Event Manager
const events = {
    init() {
        document.onkeydown = e => e.key === 'Escape' && modal.close();
        window.onclick = e => e.target === document.getElementById('modalMetodos') && modal.close();
        window.onfocus = () => !state.isLoading && loader.loadAll();
        window.onerror = e => ui.showSync('Error inesperado', 'error');
        window.onunhandledrejection = () => ui.showSync('Error de conexión', 'warning');
    },
    
    setupSync() {
        if (state.syncIntervalId) clearInterval(state.syncIntervalId);
        state.syncIntervalId = setInterval(() => {
            if (!state.isLoading && document.visibilityState === 'visible') loader.loadAll();
        }, CONFIG.SYNC_INTERVAL);
    }
};

// Debug functions
const debug = {
    personas: () => console.table(Array.from(state.personas.values()).slice(0, 10)),
    historial: () => console.table(state.historial.slice(0, 10)),
    equipos: () => {
        const prestados = [];
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const est = state.getEquipoState(i.toString());
            if (est.prestado) prestados.push({equipo: i, usuario: est.nombreCompleto});
        }
        console.table(prestados);
    },
    reset: () => confirm('¿Resetear vista?') && (state.setHistorial([]), grid.updateAll()),
    sync: () => loader.loadAll()
};

// Inicialización
const app = {
    async init() {
        try {
            const missing = ['malla', 'modalMetodos'].filter(id => !document.getElementById(id));
            if (missing.length) throw new Error(`Elementos faltantes: ${missing.join(', ')}`);
            
            grid.create();
            events.init();
            events.setupSync();
            await loader.loadAll();
            
            window.debug = debug;
            console.log('✅ Sistema inicializado');
        } catch (e) {
            console.error('Error:', e);
            alert(`Error: ${e.message}`);
        }
    }
};

// Eventos de carga
document.addEventListener('DOMContentLoaded', app.init);
window.addEventListener('beforeunload', () => state.syncIntervalId && clearInterval(state.syncIntervalId));

// API pública
window.EquipmentLoanSystem = {
    debug,
    forceSync: () => loader.loadAll(),
    getStats: () => ({
        personas: state.personas.size,
        historial: state.historial.length,
        equiposPrestados: Array.from({length: CONFIG.TOTAL_EQUIPOS}, (_, i) => i + 1)
            .filter(i => state.getEquipoState(i.toString()).prestado).length
    })
};

console.log('📦 Sistema de Préstamo v2.0 - Compacto');
