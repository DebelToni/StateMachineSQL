const API_BASE = 'http://localhost:8000';
let currentWorker = null;
let workersData = new Map();

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

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

async function loadDashboard() {
    try {

        const units = await apiCall('/units');
        displayCurrentUnits(units);

        const slaBreaches = await apiCall('/sla-breaches');
        displaySLABreaches(slaBreaches);

        const techBoard = await apiCall('/technicians');
        displayTechnicianBoard(techBoard);

        const throughput = await apiCall('/throughput?days=7');
        displayThroughputChart(throughput);

        const stateDistribution = await apiCall('/analytics/state-distribution');
        displayStateDistribution(stateDistribution);

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
                ${unit.technician && unit.technician !== 'Unassigned' ? `<br>Tech: <strong>${unit.technician}</strong>` : ''}
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
        grouped[item.technician][item.state] = {
            cnt: item.cnt,
            avg_time: item.avg_time_in_state_minutes || 0
        };
    });

    container.innerHTML = Object.entries(grouped).map(([tech, states]) => `
        <div class="task-item">
            <div class="task-header">
                <div class="task-name">${tech || 'Unassigned'}</div>
                <div class="task-time">${Object.values(states).reduce((a, b) => a + b.cnt, 0)} tasks</div>
            </div>
            <div class="task-details">
                ${Object.entries(states).map(([state, data]) => 
                    `${state}: ${data.cnt} (${Math.round(data.avg_time)}min avg)`
                ).join('<br>')}
            </div>
        </div>
    `).join('');
}

function displayStateDistribution(distribution) {
    const container = document.getElementById('stateDistribution');
    if (!container) return; 

    if (distribution.length === 0) {
        container.innerHTML = '<p>No state data available</p>';
        return;
    }

    container.innerHTML = distribution.slice(0, 5).map(state => `
        <div class="task-item">
            <div class="task-header">
                <div class="task-name">${state.state_name}</div>
                <div class="task-time">${state.unit_count} units (${state.percentage}%)</div>
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
            }, {
                label: 'Total Activity',
                data: data.map(d => d.total_transitions || 0),
                borderColor: '#3182ce',
                backgroundColor: 'rgba(49, 130, 206, 0.1)',
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

async function loadWorkers() {
    try {

        const workers = await apiCall('/workers/list');

        const workerSelect = document.getElementById('workerSelect');
        workerSelect.innerHTML = '<option value="">Select a worker...</option>' +
            workers.map(worker => `<option value="${worker}">${worker}</option>`).join('');

        const workerPerformance = await apiCall('/analytics/worker-performance');
        displayWorkerPerformanceOverview(workerPerformance);

        const avgDurations = await apiCall('/states/average-durations');
        displayAverageDurations(avgDurations);

    } catch (error) {
        showError('Failed to load workers data');
    }
}

function displayWorkerPerformanceOverview(performance) {
    const container = document.getElementById('workerPerformanceOverview');
    if (!container) return; 

    if (performance.length === 0) {
        container.innerHTML = '<p>No worker performance data available</p>';
        return;
    }

    container.innerHTML = performance.slice(0, 5).map(worker => {
        const successRate = worker.total_actions > 0 
            ? Math.round((worker.successful_completions / worker.total_actions) * 100)
            : 0;

        return `
            <div class="task-item ${successRate > 80 ? 'success' : (successRate < 60 ? 'error' : '')}">
                <div class="task-header">
                    <div class="task-name">${worker.technician}</div>
                    <div class="task-time">${successRate}% success</div>
                </div>
                <div class="task-details">
                    Units: ${worker.total_units_handled} | 
                    Actions: ${worker.total_actions} | 
                    Avg Response: ${worker.avg_response_time_minutes || 0}min
                </div>
            </div>
        `;
    }).join('');
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

    document.getElementById('currentWorkerTask').innerHTML = '<div class="loading">Loading current tasks...</div>';
    document.getElementById('taskHistory').innerHTML = '<div class="loading">Loading task history...</div>';

    try {

        const currentUnits = await apiCall(`/workers/${selectedWorker}/units`);
        displayWorkerCurrentUnits(currentUnits);

        const performance = await apiCall(`/workers/${selectedWorker}/performance`);
        updateWorkerDetailedStats(performance);

        const history = await apiCall(`/workers/${selectedWorker}/history?days=7`);
        displayWorkerHistory(history);

    } catch (error) {
        showError(`Failed to load data for worker ${selectedWorker}`);
    }
}

function displayWorkerCurrentUnits(units) {
    const container = document.getElementById('currentWorkerTask');

    if (units.length === 0) {
        container.innerHTML = '<p>No current tasks</p>';
        return;
    }

    container.innerHTML = units.map(unit => `
        <div class="task-item current">
            <div class="task-header">
                <div class="task-name">${unit.unit_name}</div>
                <div class="task-time">${Math.round(unit.minutes_in_state)}min</div>
            </div>
            <div class="task-details">
                Current: <strong>${unit.current_state}</strong><br>
                Since: ${formatDate(unit.state_since)}
            </div>
        </div>
    `).join('');
}

function updateWorkerDetailedStats(performance) {
    if (!performance) return;

    document.getElementById('totalTasks').textContent = performance.total_units_handled || 0;
    document.getElementById('completedTasks').textContent = performance.successful_completions || 0;
    document.getElementById('avgTaskTime').textContent = Math.round(performance.avg_response_time_minutes || 0);
    document.getElementById('currentTask').textContent = performance.active_days || 0;
}

function displayWorkerHistory(history) {
    const container = document.getElementById('taskHistory');

    if (history.length === 0) {
        container.innerHTML = '<div class="loading">No recent history available</div>';
        return;
    }

    container.innerHTML = history.map(item => {
        const isSuccess = item.signal_name === 'finished work ok';
        const isError = item.signal_name === 'finished work failed';
        const taskClass = isSuccess ? 'success' : (isError ? 'error' : '');

        return `
            <div class="task-item ${taskClass}">
                <div class="task-header">
                    <div class="task-name">${item.unit_name}</div>
                    <div class="task-time">${formatDate(item.timestamp)}</div>
                </div>
                <div class="task-details">
                    ${item.from_state} → <strong>${item.to_state}</strong><br>
                    Signal: <em>${item.signal_name}</em>
                </div>
            </div>
        `;
    }).join('');
}

function displayAverageDurations(durations) {
    const container = document.getElementById('avgDurations');
    container.innerHTML = durations.slice(0, 5).map(duration => `
        <div class="task-item">
            <div class="task-header">
                <div class="task-name">${duration.state_name}</div>
                <div class="task-time">${duration.avg_minutes}min avg</div>
            </div>
            <div class="task-details">
                Range: ${duration.min_minutes || 0}-${duration.max_minutes || 0}min | 
                Total: ${duration.total_transitions || 0} transitions
            </div>
        </div>
    `).join('');
}

async function loadProcesses() {
    try {
        const units = await apiCall('/units');
        displayEnhancedProcesses(units);

        const bottlenecks = await apiCall('/analytics/bottlenecks');
        displayBottleneckAnalysis(bottlenecks);

    } catch (error) {
        showError('Failed to load processes');
    }
}

function displayEnhancedProcesses(units) {
    const container = document.getElementById('processGrid');

    if (units.length === 0) {
        container.innerHTML = '<div class="card"><p>No processes found</p></div>';
        return;
    }

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

        const timeInState = Math.round((new Date() - new Date(unit.state_since)) / (1000 * 60));
        const timeDisplay = timeInState > 60 ?
            `${Math.round(timeInState / 60)}h ${timeInState % 60}m` :
            `${timeInState}m`;

        return `
            <div class="process-card ${cardClass}" onclick="showUnitDetails(${unit.unit_id})">
                <div class="process-header">
                    <div class="process-name">${unit.unit_name}</div>
                    <div class="process-status status-${unit.current_state.replace(/\s+/g, '-')}">${unit.current_state}</div>
                </div>
                <div class="task-details">
                    <strong>Time in state:</strong> ${timeDisplay}<br>
                    ${unit.technician && unit.technician !== 'Unassigned' ? `<strong>Technician:</strong> ${unit.technician}<br>` : ''}
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

function displayBottleneckAnalysis(bottlenecks) {
    const container = document.getElementById('bottleneckAnalysis');
    if (!container) return; 

    if (bottlenecks.length === 0) {
        container.innerHTML = '<p>No bottleneck data available</p>';
        return;
    }

    const sortedBottlenecks = bottlenecks.sort((a, b) => b.avg_hours_in_state - a.avg_hours_in_state);

    container.innerHTML = sortedBottlenecks.slice(0, 5).map(bottleneck => {
        const isHighBottleneck = bottleneck.avg_hours_in_state > 24;
        const cardClass = isHighBottleneck ? 'error' : (bottleneck.avg_hours_in_state > 8 ? 'warning' : '');

        return `
            <div class="task-item ${cardClass}">
                <div class="task-header">
                    <div class="task-name">${bottleneck.state_name}</div>
                    <div class="task-time">${Math.round(bottleneck.avg_hours_in_state)}h avg</div>
                </div>
                <div class="task-details">
                    Units: ${bottleneck.units_currently_in_state} | 
                    Max: ${Math.round(bottleneck.max_hours_in_state)}h
                </div>
            </div>
        `;
    }).join('');
}

async function loadAnalytics() {
    try {

        const heatmap = await apiCall('/heatmap');
        displayHeatmap(heatmap);

        const avgDurations = await apiCall('/states/average-durations');
        displayDurationsChart(avgDurations);

        const dailyActivity = await apiCall('/analytics/daily-activity?days=7');
        displayDailyActivityChart(dailyActivity);

        const hourlyActivity = await apiCall('/analytics/hourly-activity?hours=24');
        displayHourlyActivityChart(hourlyActivity);

        const stateDistribution = await apiCall('/analytics/state-distribution');
        displayStateDistributionChart(stateDistribution);

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

    const sortedTransitions = heatmapData
        .sort((a, b) => b.cnt - a.cnt)
        .slice(0, 10); 

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

function displayDailyActivityChart(data) {
    const ctx = document.getElementById('dailyActivityChart');
    if (!ctx) return; 

    const processedData = {};
    data.forEach(item => {
        const day = formatDate(item.day);
        if (!processedData[day]) {
            processedData[day] = { total: 0, signals: {} };
        }
        processedData[day].total += item.activity_count;
        processedData[day].signals[item.signal_name] = item.activity_count;
    });

    new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: Object.keys(processedData),
            datasets: [{
                label: 'Total Activity',
                data: Object.values(processedData).map(d => d.total),
                borderColor: '#3182ce',
                backgroundColor: 'rgba(49, 130, 206, 0.1)',
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

function displayHourlyActivityChart(data) {
    const ctx = document.getElementById('hourlyActivityChart');
    if (!ctx) return; 

    new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: data.map(d => new Date(d.hour).getHours() + ':00'),
            datasets: [{
                label: 'Activity Count',
                data: data.map(d => d.activity_count),
                backgroundColor: 'rgba(56, 161, 105, 0.6)',
                borderColor: '#38a169',
                borderWidth: 1
            }, {
                label: 'Active Technicians',
                data: data.map(d => d.active_technicians),
                backgroundColor: 'rgba(229, 62, 62, 0.6)',
                borderColor: '#e53e3e',
                borderWidth: 1
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

function displayStateDistributionChart(data) {
    const ctx = document.getElementById('stateDistributionChart');
    if (!ctx) return; 

    new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.state_name),
            datasets: [{
                data: data.map(d => d.unit_count),
                backgroundColor: data.map((_, index) =>
                    `hsl(${index * 360 / data.length}, 70%, 60%)`
                ),
                borderColor: data.map((_, index) =>
                    `hsl(${index * 360 / data.length}, 70%, 50%)`
                ),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                }
            }
        }
    });
}

function generateEnhancedTimeline(unit) {

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

            const stateIndex = standardStates.findIndex(s => s.name === state.name);
            const currentIndex = standardStates.findIndex(s => s.name === currentState);

            if (stateIndex < currentIndex) {
                dotClass = 'completed';

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

async function showUnitDetails(unitId) {
    try {
        const durations = await apiCall(`/units/${unitId}/durations`);

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
                        <div class="task-item ${duration.left_at === 'now()' || !duration.left_at ? 'current' : 'success'}">
                            <div class="task-header">
                                <div class="task-name">${duration.state_name}</div>
                                <div class="task-time">${Math.round(duration.minutes_spent)} min</div>
                            </div>
                            <div class="task-details">
                                Entered: ${formatDate(duration.entered_at)}<br>
                                ${duration.left_at && duration.left_at !== 'now()' 
                                    ? `Left: ${formatDate(duration.left_at)}` 
                                    : '<strong>Currently here</strong>'}
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

document.addEventListener('DOMContentLoaded', function() {

    const workerSelect = document.getElementById('workerSelect');
    if (workerSelect) {
        workerSelect.addEventListener('change', selectWorker);
    }
});

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

    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        document.querySelector('.container').insertBefore(errorDiv, document.querySelector('.nav-tabs'));
    }

    errorDiv.textContent = message;

    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

let autoRefreshInterval;

function startAutoRefresh() {
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

document.addEventListener('DOMContentLoaded', function () {
    loadDashboard();
    startAutoRefresh();

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stopAutoRefresh();
        } else {
            startAutoRefresh();
        }
    });
});

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