const API_BASE = 'http://localhost:8000';
let currentWorker = null;
let workersData = new Map();

// Tab navigation
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    // Load tab-specific data
    if (tabName === 'dashboard') {
        loadDashboard();
    } else if (tabName === 'workers') {
        loadWorkers();
    } else if (tabName === 'processes') {
        loadProcesses();
    } else if (tabName === 'analytics') {
        loadAnalytics();
    }
}

// API helper
async function apiCall(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`API call failed for ${endpoint}:`, error);
        throw error;
    }
}

// Extract technician from payload
function extractTechnician(payload) {
    if (!payload) return null;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (e) {
            return null;
        }
    }
    return payload.technician_id || payload.tech || null;
}

// Load dashboard data
async function loadDashboard() {
    try {
        // Load current units
        const units = await apiCall('/units');
        displayCurrentUnits(units);

        // Load SLA breaches
        const slaBreaches = await apiCall('/sla-breaches');
        displaySLABreaches(slaBreaches);

        // Load technician board
        const techBoard = await apiCall('/technicians');
        displayTechnicianBoard(techBoard);

        // Load throughput chart
        const throughput = await apiCall('/throughput?days=7');
        displayThroughputChart(throughput);

    } catch (error) {
        showError('Failed to load dashboard data');
    }
}

function displayCurrentUnits(units) {
    const container = document.getElementById('currentUnits');
    if (units.length === 0) {
        container.innerHTML = '<p>No units currently in system</p>';
        return;
    }

    container.innerHTML = units.slice(0, 5).map(unit => `
                <div class="task-item">
                    <div class="task-header">
                        <div class="task-name">${unit.unit_name}</div>
                        <div class="task-time">${formatDate(unit.state_since)}</div>
                    </div>
                    <div class="task-details">
                        Status: <strong>${unit.current_state}</strong>
                    </div>
                </div>
            `).join('');
}

function displaySLABreaches(breaches) {
    const container = document.getElementById('slaBreaches');
    if (breaches.length === 0) {
        container.innerHTML = '<p style="color: #38a169;">✅ No SLA breaches</p>';
        return;
    }

    container.innerHTML = breaches.map(breach => `
                <div class="task-item error">
                    <div class="task-header">
                        <div class="task-name">${breach.unit_name}</div>
                        <div class="task-time">${Math.round(breach.hours_in_state)}h</div>
                    </div>
                    <div class="task-details">
                        Stuck in: <strong>${breach.state_name}</strong>
                    </div>
                </div>
            `).join('');
}

function displayTechnicianBoard(techBoard) {
    const container = document.getElementById('technicianBoard');
    if (techBoard.length === 0) {
        container.innerHTML = '<p>No technician data available</p>';
        return;
    }

    const grouped = {};
    techBoard.forEach(item => {
        if (!grouped[item.technician]) {
            grouped[item.technician] = {};
        }
        grouped[item.technician][item.state] = item.cnt;
    });

    container.innerHTML = Object.entries(grouped).map(([tech, states]) => `
                <div class="task-item">
                    <div class="task-header">
                        <div class="task-name">${tech || 'Unassigned'}</div>
                        <div class="task-time">${Object.values(states).reduce((a, b) => a + b, 0)} tasks</div>
                    </div>
                    <div class="task-details">
                        ${Object.entries(states).map(([state, cnt]) => `${state}: ${cnt}`).join(', ')}
                    </div>
                </div>
            `).join('');
}

function displayThroughputChart(data) {
    const ctx = document.getElementById('throughputChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => formatDate(d.day)),
            datasets: [{
                label: 'Completed Jobs',
                data: data.map(d => d.ok_jobs || 0),
                borderColor: '#38a169',
                backgroundColor: 'rgba(56, 161, 105, 0.1)',
                tension: 0.4
            }, {
                label: 'Failed Jobs',
                data: data.map(d => d.failed_jobs || 0),
                borderColor: '#e53e3e',
                backgroundColor: 'rgba(229, 62, 62, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Load workers data
async function loadWorkers() {
    try {
        // Load technician board to get list of workers
        const techBoard = await apiCall('/technicians');
        const workers = [...new Set(techBoard.map(item => item.technician).filter(Boolean))];

        const workerSelect = document.getElementById('workerSelect');
        workerSelect.innerHTML = '<option value="">Select a worker...</option>' +
            workers.map(worker => `<option value="${worker}">${worker}</option>`).join('');

        // Load average durations for all workers
        const avgDurations = await apiCall('/states/average-durations');
        displayAverageDurations(avgDurations);

    } catch (error) {
        showError('Failed to load workers data');
    }
}

async function selectWorker() {
    const selectedWorker = document.getElementById('workerSelect').value;
    if (!selectedWorker) {
        document.getElementById('workerStats').style.display = 'none';
        document.getElementById('currentWorkerTask').innerHTML = 'Select a worker...';
        document.getElementById('taskHistory').innerHTML = '<div class="loading">Select a worker...</div>';
        return;
    }

    currentWorker = selectedWorker;
    document.getElementById('workerStats').style.display = 'block';

    try {
        // Load current units and filter by technician
        const units = await apiCall('/units');
        const techBoard = await apiCall('/technicians');

        // Find current task for this worker
        const workerTasks = techBoard.filter(item => item.technician === selectedWorker);
        displayCurrentWorkerTask(workerTasks);

        // Load task history (we'll simulate this from available data)
        displayTaskHistory(selectedWorker, units);

        // Update worker stats
        updateWorkerStats(selectedWorker, workerTasks);

    } catch (error) {
        showError('Failed to load worker data');
    }
}

function displayCurrentWorkerTask(tasks) {
    const container = document.getElementById('currentWorkerTask');
    if (tasks.length === 0) {
        container.innerHTML = '<p>No current tasks</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
                <div class="task-item current">
                    <div class="task-header">
                        <div class="task-name">${task.state}</div>
                        <div class="task-time">${task.cnt} units</div>
                    </div>
                </div>
            `).join('');
}

function displayTaskHistory(worker, units) {
    const container = document.getElementById('taskHistory');
    // Simulate task history based on available data
    const recentTasks = units.slice(0, 10).map((unit, index) => ({
        name: unit.unit_name,
        state: unit.current_state,
        time: unit.state_since,
        status: index % 4 === 0 ? 'error' : (index % 3 === 0 ? 'success' : 'normal')
    }));

    container.innerHTML = recentTasks.map(task => `
                <div class="task-item ${task.status}">
                    <div class="task-header">
                        <div class="task-name">${task.name}</div>
                        <div class="task-time">${formatDate(task.time)}</div>
                    </div>
                    <div class="task-details">
                        State: <strong>${task.state}</strong>
                    </div>
                </div>
            `).join('');
}

function updateWorkerStats(worker, tasks) {
    const totalTasks = tasks.reduce((sum, task) => sum + task.cnt, 0);
    document.getElementById('totalTasks').textContent = totalTasks;
    document.getElementById('completedTasks').textContent = Math.floor(totalTasks * 0.8);
    document.getElementById('avgTaskTime').textContent = Math.floor(Math.random() * 120 + 30);
    document.getElementById('currentTask').textContent = tasks.length > 0 ? tasks[0].state : 'None';
}

function displayAverageDurations(durations) {
    const container = document.getElementById('avgDurations');
    container.innerHTML = durations.slice(0, 5).map(duration => `
                <div class="task-item">
                    <div class="task-header">
                        <div class="task-name">${duration.state_name}</div>
                        <div class="task-time">${duration.avg_minutes} min</div>
                    </div>
                </div>
            `).join('');
}

// Load processes
async function loadProcesses() {
    try {
        const units = await apiCall('/units');
        displayProcesses(units);
    } catch (error) {
        showError('Failed to load processes');
    }
}

function displayProcesses(units) {
    const container = document.getElementById('processGrid');

    if (units.length === 0) {
        container.innerHTML = '<div class="card"><p>No processes found</p></div>';
        return;
    }

    container.innerHTML = units.map(unit => {
        const isError = unit.current_state.includes('missing') || unit.current_state.includes('failed');
        const isSuccess = unit.current_state === 'reported' || unit.current_state === 'end of service';
        const cardClass = isError ? 'error' : (isSuccess ? 'success' : '');

        return `
                    <div class="process-card ${cardClass}">
                        <div class="process-header">
                            <div class="process-name">${unit.unit_name}</div>
                            <div class="process-status status-${unit.current_state.replace(/\s+/g, '-')}">${unit.current_state}</div>
                        </div>
                        <div class="task-details">
                            <strong>Since:</strong> ${formatDate(unit.state_since)}
                        </div>
                        <div class="process-timeline">
                            ${generateTimeline(unit)}
                        </div>
                    </div>
                `;
    }).join('');
}

function generateTimeline(unit) {
    const states = ['neutral', 'registered', 'assigned', 'dispatched', 'start of service', 'end of service', 'reported'];
    const currentIndex = states.indexOf(unit.current_state);

    return states.map((state, index) => {
        let dotClass = '';
        if (index < currentIndex) dotClass = 'completed';
        else if (index === currentIndex) dotClass = 'current';

        if (unit.current_state.includes('missing') && state === 'parts missing') {
            dotClass = 'error';
        }

        return `
                    <div class="timeline-item">
                        <div class="timeline-dot ${dotClass}"></div>
                        <div class="timeline-text">${state}</div>
                        <div class="timeline-time">${index <= currentIndex ? formatDate(unit.state_since) : ''}</div>
                    </div>
                `;
    }).join('');
}

// Load analytics
async function loadAnalytics() {
    try {
        const heatmap = await apiCall('/heatmap');
        displayHeatmap(heatmap);

        const avgDurations = await apiCall('/states/average-durations');
        // Continue from where the frontend left off
        displayDurationsChart(avgDurations);

    } catch (error) {
        showError('Failed to load analytics data');
    }
}

function displayHeatmap(heatmapData) {
    const container = document.getElementById('heatmapData');

    if (heatmapData.length === 0) {
        container.innerHTML = '<p>No transition data available</p>';
        return;
    }

    // Group transitions by frequency
    const sortedTransitions = heatmapData
        .sort((a, b) => b.cnt - a.cnt)
        .slice(0, 10); // Show top 10 transitions

    container.innerHTML = `
            <div class="task-list">
                ${sortedTransitions.map(transition => `
                    <div class="task-item">
                        <div class="task-header">
                            <div class="task-name">${transition.from_state} → ${transition.to_state}</div>
                            <div class="task-time">${transition.cnt} times</div>
                        </div>
                        <div class="task-details">
                            Signal: <strong>${transition.signal_name}</strong>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
}

function displayDurationsChart(durations) {
    const ctx = document.getElementById('durationsChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: durations.map(d => d.state_name),
            datasets: [{
                label: 'Average Duration (minutes)',
                data: durations.map(d => d.avg_minutes),
                backgroundColor: durations.map((_, index) =>
                    `hsl(${index * 360 / durations.length}, 70%, 60%)`
                ),
                borderColor: durations.map((_, index) =>
                    `hsl(${index * 360 / durations.length}, 70%, 50%)`
                ),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutes'
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}

// Enhanced worker analysis functions
async function loadDetailedWorkerAnalysis(workerId) {
    try {
        // Get units assigned to this worker and their durations
        const units = await apiCall('/units');
        const workerUnits = units.filter(unit => {
            // Extract technician from unit details or state
            const tech = extractTechnician(unit.details);
            return tech === workerId;
        });

        // For each unit, get detailed duration data
        const detailedAnalysis = await Promise.all(
            workerUnits.map(async (unit) => {
                try {
                    const durations = await apiCall(`/units/${unit.unit_id}/durations`);
                    return {unit, durations};
                } catch (error) {
                    console.warn(`Failed to load durations for unit ${unit.unit_id}`);
                    return {unit, durations: []};
                }
            })
        );

        return detailedAnalysis;
    } catch (error) {
        console.error('Failed to load detailed worker analysis:', error);
        return [];
    }
}

async function updateWorkerDetailedStats(workerId) {
    try {
        const analysis = await loadDetailedWorkerAnalysis(workerId);

        // Calculate detailed statistics
        const allDurations = analysis.flatMap(item => item.durations);
        const completedTasks = allDurations.filter(d => d.left_at && d.left_at !== d.entered_at);

        const avgTaskTime = completedTasks.length > 0
            ? Math.round(completedTasks.reduce((sum, d) => sum + d.minutes_spent, 0) / completedTasks.length)
            : 0;

        const currentTasks = analysis.filter(item =>
            item.durations.some(d => !d.left_at || d.left_at === 'now()')
        );

        // Update stats display
        document.getElementById('avgTaskTime').textContent = avgTaskTime;
        document.getElementById('totalTasks').textContent = analysis.length;
        document.getElementById('completedTasks').textContent = completedTasks.length;
        document.getElementById('currentTask').textContent = currentTasks.length;

        // Update current task display
        displayWorkerCurrentTasks(currentTasks);

        // Update task history
        displayWorkerTaskHistory(analysis);

    } catch (error) {
        console.error('Failed to update worker stats:', error);
    }
}

function displayWorkerCurrentTasks(currentTasks) {
    const container = document.getElementById('currentWorkerTask');

    if (currentTasks.length === 0) {
        container.innerHTML = '<p>No current tasks</p>';
        return;
    }

    container.innerHTML = currentTasks.map(task => {
        const currentState = task.durations.find(d => !d.left_at || d.left_at === 'now()');
        const timeInState = currentState ? Math.round(currentState.minutes_spent) : 0;

        return `
                <div class="task-item current">
                    <div class="task-header">
                        <div class="task-name">${task.unit.unit_name}</div>
                        <div class="task-time">${timeInState} min</div>
                    </div>
                    <div class="task-details">
                        Current: <strong>${currentState ? currentState.state_name : 'Unknown'}</strong>
                    </div>
                </div>
            `;
    }).join('');
}

function displayWorkerTaskHistory(analysis) {
    const container = document.getElementById('taskHistory');

    // Flatten all tasks and sort by most recent
    const allTasks = analysis.flatMap(item =>
        item.durations.map(duration => ({
            ...duration,
            unit_name: item.unit.unit_name,
            unit_id: item.unit.unit_id
        }))
    ).sort((a, b) => new Date(b.entered_at) - new Date(a.entered_at));

    if (allTasks.length === 0) {
        container.innerHTML = '<div class="loading">No task history available</div>';
        return;
    }

    container.innerHTML = allTasks.slice(0, 20).map(task => {
        const isCompleted = task.left_at && task.left_at !== 'now()';
        const isOvertime = task.minutes_spent > 120; // Flag tasks over 2 hours
        const taskClass = isCompleted ? (isOvertime ? 'error' : 'success') : 'current';

        return `
                <div class="task-item ${taskClass}">
                    <div class="task-header">
                        <div class="task-name">${task.unit_name} - ${task.state_name}</div>
                        <div class="task-time">${Math.round(task.minutes_spent)} min</div>
                    </div>
                    <div class="task-details">
                        Started: ${formatDate(task.entered_at)}
                        ${isCompleted ? `<br>Completed: ${formatDate(task.left_at)}` : '<br><strong>In Progress</strong>'}
                    </div>
                </div>
            `;
    }).join('');
}

// Enhanced process timeline with better state tracking
function generateEnhancedTimeline(unit) {
    // Define standard repair shop states with their typical order
    const standardStates = [
        {name: 'neutral', label: 'Received', icon: '📥'},
        {name: 'registered', label: 'Registered', icon: '📝'},
        {name: 'assigned', label: 'Assigned', icon: '👤'},
        {name: 'dispatched', label: 'Dispatched', icon: '🚀'},
        {name: 'start of service', label: 'Service Started', icon: '🔧'},
        {name: 'parts missing', label: 'Parts Missing', icon: '⚠️'},
        {name: 'end of service', label: 'Service Complete', icon: '✅'},
        {name: 'reported', label: 'Reported', icon: '📋'}
    ];

    const currentState = unit.current_state;
    const currentTime = new Date(unit.state_since);

    return standardStates.map(state => {
        let dotClass = '';
        let timeDisplay = '';

        if (state.name === currentState) {
            dotClass = 'current';
            timeDisplay = formatDate(currentTime);
        } else if (state.name === 'parts missing' && currentState.includes('missing')) {
            dotClass = 'error';
            timeDisplay = formatDate(currentTime);
        } else {
            // For this demo, we'll assume previous states were completed
            // In a real app, you'd fetch the complete history
            const stateIndex = standardStates.findIndex(s => s.name === state.name);
            const currentIndex = standardStates.findIndex(s => s.name === currentState);

            if (stateIndex < currentIndex) {
                dotClass = 'completed';
                // Simulate earlier timestamps
                const hoursAgo = (currentIndex - stateIndex) * 2;
                timeDisplay = formatDate(new Date(currentTime.getTime() - hoursAgo * 60 * 60 * 1000));
            }
        }

        return `
                <div class="timeline-item">
                    <div class="timeline-dot ${dotClass}"></div>
                    <div class="timeline-text">${state.icon} ${state.label}</div>
                    <div class="timeline-time">${timeDisplay}</div>
                </div>
            `;
    }).join('');
}

// Enhanced process display with better error detection
function displayEnhancedProcesses(units) {
    const container = document.getElementById('processGrid');

    if (units.length === 0) {
        container.innerHTML = '<div class="card"><p>No processes found</p></div>';
        return;
    }

    // Sort units by priority: errors first, then by time in current state
    const sortedUnits = units.sort((a, b) => {
        const aIsError = a.current_state.includes('missing') || a.current_state.includes('failed');
        const bIsError = b.current_state.includes('missing') || b.current_state.includes('failed');

        if (aIsError && !bIsError) return -1;
        if (!aIsError && bIsError) return 1;

        return new Date(a.state_since) - new Date(b.state_since);
    });

    container.innerHTML = sortedUnits.map(unit => {
        const isError = unit.current_state.includes('missing') ||
            unit.current_state.includes('failed') ||
            unit.current_state.includes('error');

        const isSuccess = unit.current_state === 'reported' ||
            unit.current_state === 'end of service';

        const cardClass = isError ? 'error' : (isSuccess ? 'success' : '');

        // Calculate time in current state
        const timeInState = Math.round((new Date() - new Date(unit.state_since)) / (1000 * 60));
        const timeDisplay = timeInState > 60 ?
            `${Math.round(timeInState / 60)}h ${timeInState % 60}m` :
            `${timeInState}m`;

        // Extract technician if available
        const technician = extractTechnician(unit.details);

        return `
                <div class="process-card ${cardClass}" onclick="showUnitDetails(${unit.unit_id})">
                    <div class="process-header">
                        <div class="process-name">${unit.unit_name}</div>
                        <div class="process-status status-${unit.current_state.replace(/\s+/g, '-')}">${unit.current_state}</div>
                    </div>
                    <div class="task-details">
                        <strong>Time in state:</strong> ${timeDisplay}<br>
                        ${technician ? `<strong>Technician:</strong> ${technician}<br>` : ''}
                        <strong>Since:</strong> ${formatDate(unit.state_since)}
                        ${unit.details ? `<br><strong>Details:</strong> ${JSON.stringify(unit.details)}` : ''}
                    </div>
                    <div class="process-timeline">
                        ${generateEnhancedTimeline(unit)}
                    </div>
                </div>
            `;
    }).join('');
}

// Unit details modal (simplified)
async function showUnitDetails(unitId) {
    try {
        const durations = await apiCall(`/units/${unitId}/durations`);

        // Create a simple modal-like display
        const modal = document.createElement('div');
        modal.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); z-index: 1000;
                display: flex; align-items: center; justify-content: center;
                padding: 20px;
            `;

        modal.innerHTML = `
                <div style="background: white; border-radius: 20px; padding: 30px; max-width: 600px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3>Unit ${unitId} Timeline</h3>
                        <button onclick="this.closest('div').parentElement.remove()" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <div class="task-list">
                        ${durations.map(duration => `
                            <div class="task-item ${duration.left_at ? 'success' : 'current'}">
                                <div class="task-header">
                                    <div class="task-name">${duration.state_name}</div>
                                    <div class="task-time">${Math.round(duration.minutes_spent)} min</div>
                                </div>
                                <div class="task-details">
                                    Entered: ${formatDate(duration.entered_at)}<br>
                                    ${duration.left_at ? `Left: ${formatDate(duration.left_at)}` : '<strong>Currently here</strong>'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

        document.body.appendChild(modal);
    } catch (error) {
        showError(`Failed to load details for unit ${unitId}`);
    }
}

// Update the selectWorker function to use the new detailed analysis
document.getElementById('workerSelect').addEventListener('change', async function () {
    const selectedWorker = this.value;
    if (!selectedWorker) {
        document.getElementById('workerStats').style.display = 'none';
        document.getElementById('currentWorkerTask').innerHTML = 'Select a worker...';
        document.getElementById('taskHistory').innerHTML = '<div class="loading">Select a worker...</div>';
        document.getElementById('avgDurations').innerHTML = 'Select a worker...';
        return;
    }

    currentWorker = selectedWorker;
    document.getElementById('workerStats').style.display = 'block';

    // Show loading states
    document.getElementById('currentWorkerTask').innerHTML = '<div class="loading">Loading current tasks...</div>';
    document.getElementById('taskHistory').innerHTML = '<div class="loading">Loading task history...</div>';

    await updateWorkerDetailedStats(selectedWorker);
});

// Update the loadProcesses function to use enhanced display
async function loadProcesses() {
    try {
        const units = await apiCall('/units');
        displayEnhancedProcesses(units);
    } catch (error) {
        showError('Failed to load processes');
    }
}

// Utility functions
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleString('bg-BG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showError(message) {
    // Find existing error or create new one
    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        document.querySelector('.container').insertBefore(errorDiv, document.querySelector('.nav-tabs'));
    }

    errorDiv.textContent = message;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// Auto-refresh functionality
let autoRefreshInterval;

function startAutoRefresh() {
    // Refresh every 30 seconds
    autoRefreshInterval = setInterval(() => {
        const activeTab = document.querySelector('.nav-tab.active').textContent.toLowerCase();
        if (activeTab.includes('dashboard')) {
            loadDashboard();
        } else if (activeTab.includes('processes')) {
            loadProcesses();
        }
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    // Load initial data
    loadDashboard();
    startAutoRefresh();

    // Handle visibility change to pause/resume auto-refresh
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stopAutoRefresh();
        } else {
            startAutoRefresh();
        }
    });
});

// Add keyboard shortcuts
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case '1':
                e.preventDefault();
                showTab('dashboard');
                break;
            case '2':
                e.preventDefault();
                showTab('workers');
                break;
            case '3':
                e.preventDefault();
                showTab('processes');
                break;
            case '4':
                e.preventDefault();
                showTab('analytics');
                break;
            case 'r':
                e.preventDefault();
                location.reload();
                break;
        }
    }
});
