const CONFIG = {
    URLS: {
        PERSONAS: 'https://docs.google.com/spreadsheets/d/1GU1oKIb9E0Vvwye6zRB2F_fT2jGzRvJ0WoLtWKuio-E/gviz/tq?tqx=out:json&gid=1744634045',
        HISTORIAL: 'https://docs.google.com/spreadsheets/d/1ohT8rfNsG4h7JjPZllHoyrxePutKsv2Q-5mBeUozia0/gviz/tq?tqx=out:json&gid=1185155654',
        GOOGLE_FORM: 'https://docs.google.com/forms/d/e/1FAIpQLSfe3gplfkjNe3qEjC5l_Jqhsrk_zPSdQM_Wg0M6BUhoHtj9tg/formResponse',
        URL_WEB_APP: 'https://script.google.com/macros/s/AKfycbxCr0EnWrwO8TE1fgBK5aJ7yX--LAfJJi_pPn2quK9ug8kfU2h0V4-DQNiYgDyxDwC-/exec' // Not directly used in this script, but kept for reference
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
    FORM_SUBMIT_DELAY: 1500, // Reduced delay for better UX after form submission, assuming script.google.com response is fast.
    TOTAL_EQUIPOS: 40, 
    RETRY_ATTEMPTS: 3, 
    RETRY_DELAY: 1000
};

// Global state management
const state = {
    personas: new Map(), // Stores people data by document ID
    historial: [], // Stores equipment movement history
    isLoading: false, // Prevents multiple sync operations
    syncIntervalId: null, // Stores the interval ID for synchronization

    /**
     * Sets the personas data from an array, mapping by document.
     * @param {Array<Object>} arr - Array of persona objects.
     */
    setPersonas(arr) { 
        this.personas.clear(); 
        arr.forEach(p => p.documento && this.personas.set(p.documento, p)); 
        console.log(`✓ Personas cargadas: ${this.personas.size}`);
    },

    /**
     * Finds a persona by document ID.
     * @param {string} doc - Document ID.
     * @returns {Object|null} Persona object if found, otherwise null.
     */
    findPersona(doc) { return this.personas.get(doc) || null; },

    /**
     * Adds a new entry to the historical data.
     * @param {Object} entry - The history entry to add.
     */
    addHistorial(entry) { 
        this.historial.unshift({...entry, marcaTemporal: new Date()}); 
        // Keep history sorted by timestamp if needed, but unshift adds to front.
        // For accurate sorting on new entries, a re-sort might be considered if order matters beyond add.
        // For this app, unshift is fine as `getEquipoState` just takes the first entry.
    },

    /**
     * Sets the historical data from an array, sorting by timestamp.
     * @param {Array<Object>} arr - Array of historical entries.
     */
    setHistorial(arr) { 
        this.historial = arr.sort((a, b) => new Date(b.marcaTemporal) - new Date(a.marcaTemporal)); 
        console.log(`✓ Historial cargado: ${this.historial.length}`);
    },

    /**
     * Determines the current state of an equipment.
     * @param {number} num - Equipment number.
     * @returns {Object} State object (prestado, ultimoMovimiento, nombreCompleto).
     */
    getEquipoState(num) {
        const movs = this.historial.filter(h => h.equipo === num.toString());
        if (!movs.length) return {prestado: false};
        const ultimo = movs[0]; // Assuming historial is always sorted by marcaTemporal descending
        return {
            prestado: ultimo.tipo === 'Préstamo', 
            ultimoMovimiento: ultimo, 
            nombreCompleto: ultimo.nombreCompleto
        };
    }
};

// Utility functions
const utils = {
    /**
     * Parses the Google Sheets gviz JSON response.
     * @param {string} text - Raw JSONP string from Google Sheets.
     * @returns {Object} Parsed JSON data.
     */
    parseGoogleResponse(text) {
        const cleaned = text.substring(text.indexOf('(')+1, text.lastIndexOf(')'));
        return JSON.parse(cleaned);
    },

    /**
     * Extracts the value from a Google Sheets cell object.
     * @param {Object} cell - The cell object.
     * @returns {string} The trimmed cell value or an empty string.
     */
    getCellValue(cell) {
        return cell && cell.v !== null && cell.v !== undefined ? 
               (typeof cell.v === 'string' ? cell.v.trim() : String(cell.v)) : '';
    },

    /**
     * Validates if a string consists only of digits.
     * @param {string} doc - The document string to validate.
     * @returns {boolean} True if valid, false otherwise.
     */
    isValidDoc(doc) {
        return /^\d+$/.test(doc);
    },

    /**
     * Formats a date object into a readable string.
     * @param {Date|string} date - The date to format.
     * @returns {string} Formatted date string.
     */
    formatDateTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    },

    /**
     * Retries an async function a specified number of times.
     * @param {Function} fn - The async function to retry.
     * @param {number} attempts - Number of retry attempts.
     * @returns {Promise<any>} The result of the function if successful.
     * @throws {Error} The last error if all attempts fail.
     */
    async retryAsync(fn, attempts = CONFIG.RETRY_ATTEMPTS) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (e) {
                console.warn(`Intento ${i + 1} fallido. Reintentando...`, e);
                if (i === attempts - 1) throw e;
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY));
            }
        }
    }
};

// UI handlers for synchronization messages
const ui = {
    /**
     * Shows a synchronization status message.
     * @param {string} msg - Message to display.
     * @param {string} type - Type of message (info, success, error, warning).
     * @param {boolean} [autoHide=true] - Whether to hide the message automatically.
     * @param {boolean} [silent=false] - If true, only show if type is not 'info' or 'success'.
     */
    showSync(msg, type = 'info', autoHide = true, silent = false) {
        const el = document.getElementById('sync-status');
        if (!el) return;
        
        if (silent && (type === 'info' || type === 'success')) {
            // Do not show sync messages for regular successful background operations
            return;
        }

        el.textContent = msg;
        el.className = `sync-status sync-${type}`;
        el.style.display = 'block';
        
        if (autoHide) {
            setTimeout(() => el.style.display = 'none', 3000);
        }
    },
    
    /**
     * Shows a temporary error message related to a form input.
     * @param {HTMLElement} inputElement - The input field where the error occurred.
     * @param {string} message - The error message.
     */
    showInputError(inputElement, message) {
        let errorEl = inputElement.nextElementSibling;
        if (!errorEl || !errorEl.classList.contains('input-error-message')) {
            errorEl = document.createElement('div');
            errorEl.className = 'input-error-message';
            inputElement.parentNode.insertBefore(errorEl, inputElement.nextSibling);
        }
        errorEl.textContent = message;
        errorEl.style.color = 'red';
        errorEl.style.fontSize = '0.85em';
        errorEl.style.marginTop = '5px';

        // Clear error after a few seconds
        setTimeout(() => {
            if (errorEl && errorEl.parentNode) {
                errorEl.parentNode.removeChild(errorEl);
            }
        }, 5000);
    },

    /**
     * Clears any input error message associated with an input element.
     * @param {HTMLElement} inputElement - The input field.
     */
    clearInputError(inputElement) {
        const errorEl = inputElement.nextElementSibling;
        if (errorEl && errorEl.classList.contains('input-error-message')) {
            errorEl.parentNode.removeChild(errorEl);
        }
    }
};

// Modal functions for loan/return forms
const modal = {
    el: null,
    currentEquipo: null,
    
    init() {
        this.el = document.getElementById('modalMetodos');
        if (!this.el) {
            console.error('Modal element #modalMetodos not found.');
            return;
        }
        
        // Close modal when clicking outside content
        this.el.addEventListener('click', (e) => {
            if (e.target === this.el) this.close();
        });
        
        // Close modal with Escape key
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
        
        // Focus on the first input after modal opens
        setTimeout(() => {
            const firstInput = this.el.querySelector('input, textarea, select');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    },

    close() {
        if (this.el) {
            this.el.style.display = 'none';
            this.currentEquipo = null;
            // Clear previous form content to prevent stale data
            const container = document.getElementById('listaMetodos');
            if (container) container.innerHTML = ''; 
        }
    },

    renderContent() {
        const container = document.getElementById('listaMetodos');
        if (!container) return;

        const estado = state.getEquipoState(this.currentEquipo);
        const isPrestado = estado.prestado;

        if (isPrestado) {
            container.innerHTML = this.generateReturnForm(estado.ultimoMovimiento);
        } else {
            container.innerHTML = this.generateLoanForm();
        }

        this.setupFormEvents();
    },

    generateLoanForm() {
        return `
            <form id="equipmentForm" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label for="documento" style="font-weight: bold;">Documento:</label>
                    <input type="text" 
                           id="documento" 
                           name="documento" 
                           required 
                           autocomplete="off"
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
                           placeholder="Ingrese el documento">
                    <small class="input-info-message" style="color: #666;">Ingrese el documento para autocompletar datos.</small>
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
                            style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
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
                           id="documento" 
                           name="documento" 
                           value="${ultimoMovimiento.documento || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Estudiante:</label>
                    <input type="text" 
                           id="nombreCompletoDisplay"
                           value="${ultimoMovimiento.nombreCompleto || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Curso:</label>
                    <input type="text" 
                           id="cursoDisplay"
                           value="${ultimoMovimiento.curso || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Profesor Encargado:</label>
                    <input type="text" 
                           id="profesorEncargado" 
                           name="profesorEncargado" 
                           value="${ultimoMovimiento.profesorEncargado || ''}"
                           readonly
                           style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; background-color: #f8f9fa;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-weight: bold;">Asignatura:</label>
                    <input type="text" 
                           id="materia" 
                           name="materia" 
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

                <input type="hidden" name="nombreCompleto" value="${ultimoMovimiento.nombreCompleto || ''}">
                <input type="hidden" name="curso" value="${ultimoMovimiento.curso || ''}">
                <input type="hidden" name="telefono" value="${ultimoMovimiento.telefono || ''}">
                <input type="hidden" id="tipo" name="tipo" value="Devolución">

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

        const docInput = form.querySelector('#documento');
        const tipoInput = form.querySelector('#tipo');

        // Event for document validation and autofill (only for Loan forms)
        if (docInput && tipoInput.value === 'Préstamo') {
            docInput.addEventListener('input', (e) => {
                ui.clearInputError(docInput); // Clear previous errors on input
                const doc = e.target.value.trim();
                if (doc.length >= 4 && utils.isValidDoc(doc)) { // Check after a few characters or full ID
                    const persona = state.findPersona(doc);
                    if (persona) {
                        this.autofillPersonData(persona);
                        ui.showSync(`Persona encontrada: ${persona.nombreCompleto}`, 'info', true, true); // Silent success
                    } else {
                        // Optionally provide real-time feedback that persona is not found
                        ui.showSync('Documento no registrado', 'warning', true, true); // Silent warning
                    }
                }
            });
        }

        // Form submission event
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';

            const formData = new FormData(form);
            const data = Object.fromEntries(formData);
            data.equipo = this.currentEquipo.toString(); // Ensure equipo is string for consistency
            data.marcaTemporal = new Date().toISOString();

            // --- Document Validation Logic (for Préstamo only) ---
            if (data.tipo === 'Préstamo') {
                const doc = data.documento;
                const persona = state.findPersona(doc);
                if (!doc || !utils.isValidDoc(doc) || !persona) {
                    ui.showInputError(docInput, 'Documento inválido o no registrado. Por favor, ingrese un documento válido y existente.');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    return; // Stop submission
                }
                // Ensure autofilled data is set correctly before submission
                this.autofillPersonData(persona); 
                // Re-read formData after autofill to include hidden fields if needed (though autofill directly updates them)
                Object.assign(data, Object.fromEntries(new FormData(form)));
            }
            // --- End Document Validation Logic ---

            try {
                // Remove fields that are for display only on return form if they exist
                if (data.tipo === 'Devolución') {
                    delete data.nombreCompletoDisplay;
                    delete data.cursoDisplay;
                }

                await forms.submit(data);
                
                ui.showSync('Registro exitoso', 'success');
                this.close();
                
                // Update local state and grid
                state.addHistorial(data); // Add the newly recorded movement
                grid.updateAll();
                
            } catch (error) {
                console.error('Error al enviar:', error);
                ui.showSync('Error al registrar. Intente de nuevo.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });

        // Prevent modal from closing when clicking inside the form
        form.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    },

    /**
     * Autofills hidden input fields in the loan form with persona data.
     * @param {Object} persona - The persona object to autofill from.
     */
    autofillPersonData(persona) {
        const form = document.getElementById('equipmentForm');
        if (!form) return;

        const hiddenFields = {
            nombreCompleto: form.querySelector('input[name="nombreComplepleto"]'),
            curso: form.querySelector('input[name="curso"]'),
            telefono: form.querySelector('input[name="telefono"]')
        };

        if (hiddenFields.nombreCompleto) hiddenFields.nombreCompleto.value = persona.nombreCompleto || '';
        if (hiddenFields.curso) hiddenFields.curso.value = persona.curso || '';
        if (hiddenFields.telefono) hiddenFields.telefono.value = persona.telefono || '';
        
        // Optional: Provide visual feedback to the user on the loan form
        const docInput = form.querySelector('#documento');
        if (docInput) {
            ui.clearInputError(docInput);
            // Could add a temporary green border or icon to docInput
        }
    }
};

// Data loader functions
const loader = {
    async loadPersonas() {
        console.log('Cargando personas...');
        const resp = await fetch(CONFIG.URLS.PERSONAS);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        
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
    },

    async loadHistorial() {
        console.log('Cargando historial...');
        const resp = await fetch(CONFIG.URLS.HISTORIAL);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        
        const data = utils.parseGoogleResponse(await resp.text());
        const historial = data.table.rows.slice(1)
            .map(row => ({
                marcaTemporal: new Date(utils.getCellValue(row.c[0]) || Date.now()), // Ensure Date object
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
    },

    async loadAll(initialLoad = false) {
        if (state.isLoading) {
            console.log('Sincronización en curso, omitiendo nueva solicitud.');
            return;
        }
        
        state.isLoading = true;
        // Only show message on initial load or if it's not a silent background sync
        if (initialLoad) {
            ui.showSync('Sincronizando datos...', 'info', false);
        }

        try {
            await Promise.all([
                utils.retryAsync(() => this.loadPersonas()),
                utils.retryAsync(() => this.loadHistorial())
            ]);
            
            grid.updateAll();
            // Only show success message if it's not a silent background sync
            if (initialLoad) {
                 ui.showSync('Sincronización completa', 'success');
            } else {
                 ui.showSync('Sincronizado', 'success', true, true); // Silent sync for background updates
            }
           
        } catch (e) {
            console.error('Error durante la sincronización:', e);
            ui.showSync('Error de sincronización. Los datos pueden estar desactualizados.', 'error');
        } finally {
            state.isLoading = false;
        }
    }
};

// Grid display functions
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
            
            // Hover effects (already present)
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

        malla.innerHTML = ''; // Clear existing content
        malla.appendChild(frag);
        console.log(`✓ Creados ${CONFIG.TOTAL_EQUIPOS} equipos`);
    },

    updateAll() {
        console.log('Actualizando estados de equipos...');
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const el = document.querySelector(`[data-equipo="${i}"]`);
            const statusEl = el?.querySelector('.estado-equipo');
            if (!el) continue;

            const estado = state.getEquipoState(i);
            el.className = 'ramo'; // Reset classes first

            if (estado.prestado) {
                el.classList.add('equipo-prestado');
                Object.assign(el.style, {
                    backgroundColor: '#d4edda', // Light green
                    borderColor: '#28a745', // Green border
                    color: '#155724' // Darker green text
                });
                if (statusEl) statusEl.textContent = `Prestado a: ${estado.nombreCompleto}`;
            } else {
                el.classList.add('equipo-disponible');
                Object.assign(el.style, {
                    backgroundColor: '#f8f9fa', // Light gray/white
                    borderColor: '#dee2e6', // Gray border
                    color: '#495057' // Dark gray text
                });
                if (statusEl) statusEl.textContent = 'Disponible';
            }
        }
        console.log('✓ Estados de equipos actualizados');
    }
};

// Google Forms submission system
const forms = {
    async submit(data) {
        const formData = new URLSearchParams();
        
        // Map data to Google Form entry IDs
        Object.entries(CONFIG.FORM_ENTRIES).forEach(([key, entry]) => {
            if (data[key] !== undefined && data[key] !== null) { // Ensure key exists and is not null/undefined
                formData.append(entry, data[key]);
            }
        });

        console.log('Enviando datos al formulario de Google:', data);
        const resp = await fetch(CONFIG.URLS.GOOGLE_FORM, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: formData,
            mode: 'no-cors' // Required for cross-origin form submissions to Google Forms
        });

        // Small delay to ensure Google Form processes, as no-cors won't give feedback
        await new Promise(resolve => setTimeout(resolve, CONFIG.FORM_SUBMIT_DELAY));
        
        // Since mode: 'no-cors', we can't check resp.ok. We assume it worked after the delay.
        // The success/failure will be determined by whether data appears in the sheet.
        return true; 
    }
};

// Global event listeners and sync setup
const events = {
    init() {
        modal.init(); // Initialize modal events
    },

    setupSync() {
        // Clear any existing interval to prevent duplicates on re-initialization
        if (state.syncIntervalId) {
            clearInterval(state.syncIntervalId);
        }
        state.syncIntervalId = setInterval(() => {
            if (!state.isLoading) {
                console.log('Sincronización automática en segundo plano...');
                loader.loadAll(false); // Do not show UI messages for automatic sync
            }
        }, CONFIG.SYNC_INTERVAL);
        console.log(`✓ Sincronización automática programada cada ${CONFIG.SYNC_INTERVAL / 1000} segundos.`);
    }
};

// Debug API for console access
const debug = {
    state: () => state, // Current global state
    personas: () => console.table([...state.personas.values()]), // All loaded personas
    historial: () => console.table(state.historial), // All loaded history entries
    prestados() { // List currently loaned equipment
        const prestados = [];
        for (let i = 1; i <= CONFIG.TOTAL_EQUIPOS; i++) {
            const estado = state.getEquipoState(i);
            if (estado.prestado) {
                prestados.push({
                    equipo: i,
                    prestadoA: estado.nombreCompleto,
                    documento: estado.ultimoMovimiento?.documento,
                    curso: estado.ultimoMovimiento?.curso,
                    fechaPrestamo: utils.formatDateTime(estado.ultimoMovimiento?.marcaTemporal)
                });
            }
        }
        console.table(prestados);
    },
    reset: () => { // Resets local state (for testing UI without affecting sheets)
        if (confirm('¿Esto borrará el historial local y la lista de personas para fines de depuración. No afecta sus Hojas de cálculo de Google. ¿Continuar?')) {
            state.setHistorial([]);
            state.setPersonas([]);
            grid.updateAll();
            ui.showSync('Estado local reseteado', 'warning');
            console.log('⚠ Estado local reseteado.');
        }
    },
    sync: () => loader.loadAll(true) // Manually trigger a full sync with UI notification
};

// Application initialization
const app = {
    async init() {
        console.log('🚀 Iniciando sistema de gestión de equipos...');
        
        try {
            const missing = ['malla', 'modalMetodos', 'sync-status'].filter(id => !document.getElementById(id));
            if (missing.length) throw new Error(`Elementos HTML faltantes: ${missing.join(', ')}. Asegúrese de que el HTML está completo.`);

            console.log('✓ Elementos HTML requeridos encontrados.');
            
            grid.create(); // Create the equipment grid visually
            events.init(); // Initialize modal and other UI events
            events.setupSync(); // Set up periodic background synchronization
            
            // Perform initial data load with UI feedback
            await loader.loadAll(true); // 'true' for initialLoad to show sync messages
            
            window.debug = debug; // Expose debug tools to console
            console.log('✅ Sistema inicializado correctamente y listo para usar.');
        } catch (e) {
            console.error('❌ Error fatal al iniciar el sistema:', e);
            alert(`Error crítico al inicializar el sistema: ${e.message}. Verifique la consola para más detalles.`);
        }
    }
};

// Ensure app.init() runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded. Starting application initialization...');
    app.init();
});

// Clean up sync interval when the page is closed or navigated away
window.addEventListener('beforeunload', () => {
    if (state.syncIntervalId) {
        clearInterval(state.syncIntervalId);
        console.log('Intervalo de sincronización detenido.');
    }
});

// Expose public API for external interaction if needed
window.EquipmentLoanSystem = {
    state,
    modal,
    debug,
    reload: () => location.reload(),
    version: '2.3.0' // Updated version
};

console.log('📦 Sistema de Préstamo v2.3 - Mejoras en validación y sincronización.');
