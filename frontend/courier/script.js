// Courier script
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('courierToken');
    const headers = { 'X-Courier-Token': token, ...options.headers };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }
    return response;
}

function checkAuth() {
    if (localStorage.getItem('courierToken')) {
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('courier-content').classList.remove('hidden');
        loadOrders();
    } else {
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('courier-content').classList.add('hidden');
    }
}

async function handleLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const response = await fetch('/api/courier?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (data.success) {
        localStorage.setItem('courierToken', data.token);
        checkAuth();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

function logout() {
    localStorage.removeItem('courierToken');
    checkAuth();
}

async function loadOrders() {
    const ordersListContainer = document.getElementById('orders-list');
    ordersListContainer.innerHTML = '<p>Загрузка заказов...</p>';
    try {
        const response = await authenticatedFetch('/api/courier?action=getOrders');
        const orders = await response.json();
        renderOrders(orders);
    } catch (error) {
        ordersListContainer.innerHTML = '<p>Ошибка загрузки заказов.</p>';
    }
}

function renderOrders(orders) {
    const ordersListContainer = document.getElementById('orders-list');
    if (orders.length === 0) {
        ordersListContainer.innerHTML = '<p>Нет доступных заказов.</p>';
        return;
    }
    let ordersHtml = orders.map(order => {
        let actionButton = '';
        if (order.status === 'Поиск курьера') {
            actionButton = `<button onclick="updateOrderStatus('${order.id}', 'Ожидание курьера')" class="bg-blue-500 text-white px-4 py-2 rounded mt-2">Принять заказ</button>`;
        } else if (order.status === 'Вручен курьеру') {
            actionButton = `<button onclick="updateOrderStatus('${order.id}', 'Доставлен')" class="bg-green-500 text-white px-4 py-2 rounded mt-2">Доставлен</button>`;
        } else if (order.status === 'Ожидание курьера') {
            actionButton = `<p class="text-yellow-600 font-bold mt-2">Ожидайте вручения заказа от администратора.</p>`;
        }

        return `
            <div class="bg-white shadow rounded-lg p-4">
                <h3 class="font-semibold">Заказ #${order.id}</h3>
                <p><strong>Статус:</strong> ${order.status}</p>
                <p><strong>Клиент:</strong> ${order.customerName}</p>
                <p><strong>Телефон:</strong> ${order.customerPhone}</p>
                <p><strong>Адрес:</strong> ${order.deliveryAddress}</p>
                <p><strong>Сумма:</strong> ${order.totalAmount} руб.</p>
                ${actionButton}
            </div>
        `;
    }).join('');
    ordersListContainer.innerHTML = ordersHtml;
}

async function updateOrderStatus(orderId, status) {
    await authenticatedFetch('/api/courier?action=updateStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status })
    });
    loadOrders();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', logout);
    checkAuth();
});