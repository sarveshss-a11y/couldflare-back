-- Business Manager D1 Database Schema
-- Run this to create your database structure

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT,
    shop_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'worker', 'editor', 'worker_editor', 'transporter', 'transporter_worker')),
    phone TEXT DEFAULT '',
    is_from_worker INTEGER DEFAULT 0,
    original_worker_id TEXT,
    is_from_editor INTEGER DEFAULT 0,
    original_editor_id TEXT,
    firebase_uid TEXT UNIQUE,
    profile_complete INTEGER DEFAULT 0,
    total_earnings REAL DEFAULT 0,
    paid_salary REAL DEFAULT 0,
    remaining_salary REAL DEFAULT 0,
    accuracy_rating INTEGER DEFAULT 5 CHECK(accuracy_rating BETWEEN 1 AND 10),
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_shop_name ON users(shop_name);

-- Shops table
CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    business_type TEXT DEFAULT 'mixed' CHECK(business_type IN ('video_editing', 'led_walls', 'drones', 'cameras', 'mixed')),
    owner_id TEXT,
    created_by TEXT DEFAULT '',
    total_orders INTEGER DEFAULT 0,
    total_projects INTEGER DEFAULT 0,
    total_revenue REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_shops_name ON shops(name);
CREATE INDEX IF NOT EXISTS idx_shops_is_active ON shops(is_active);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    client_type TEXT DEFAULT 'individual' CHECK(client_type IN ('individual', 'company', 'wedding', 'event')),
    business_category TEXT DEFAULT 'mixed' CHECK(business_category IN ('video_editing', 'led_walls', 'drones', 'cameras', 'mixed')),
    priority_level TEXT DEFAULT 'normal' CHECK(priority_level IN ('normal', 'high', 'vip')),
    notes TEXT,
    total_payments_due REAL DEFAULT 0,
    total_payments_received REAL DEFAULT 0,
    received_payments REAL DEFAULT 0,
    pending_payments REAL DEFAULT 0,
    lifetime_orders INTEGER DEFAULT 0,
    lifetime_editing_projects INTEGER DEFAULT 0,
    lifetime_value REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('paid', 'pending', 'partial')),
    shop_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_shop_name ON clients(shop_name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'quantity' CHECK(type IN ('quantity', 'size')),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    order_name TEXT NOT NULL,
    venue_place TEXT NOT NULL,
    description TEXT DEFAULT '',
    total_amount REAL NOT NULL,
    received_payment REAL DEFAULT 0,
    remaining_payment REAL NOT NULL,
    order_date TEXT,
    completion_date TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
    business_type TEXT DEFAULT 'led_walls_drones_cameras',
    created_by TEXT NOT NULL,
    shop_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_shop_name ON orders(shop_name);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Order products
CREATE TABLE IF NOT EXISTS order_products (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    size_info TEXT DEFAULT '',
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_products_order_id ON order_products(order_id);

-- Order workers
CREATE TABLE IF NOT EXISTS order_workers (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    payment REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_order_workers_order_id ON order_workers(order_id);
CREATE INDEX IF NOT EXISTS idx_order_workers_worker_id ON order_workers(worker_id);

-- Order transporters
CREATE TABLE IF NOT EXISTS order_transporters (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    transporter_id TEXT NOT NULL,
    payment REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (transporter_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_order_transporters_order_id ON order_transporters(order_id);
CREATE INDEX IF NOT EXISTS idx_order_transporters_transporter_id ON order_transporters(transporter_id);

-- Editing projects table
CREATE TABLE IF NOT EXISTS editing_projects (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    editor_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    editing_value REAL NOT NULL,
    pendrive_included INTEGER DEFAULT 0,
    pendrive_value REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    received_payment REAL DEFAULT 0,
    remaining_payment REAL NOT NULL,
    commission_percentage REAL NOT NULL CHECK(commission_percentage BETWEEN 0 AND 100),
    commission_amount REAL NOT NULL,
    start_date TEXT,
    end_date TEXT NOT NULL,
    completion_date TEXT,
    status TEXT DEFAULT 'in_progress' CHECK(status IN ('pending', 'in_progress', 'completed')),
    created_by TEXT NOT NULL,
    shop_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (editor_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_editing_projects_shop_name ON editing_projects(shop_name);
CREATE INDEX IF NOT EXISTS idx_editing_projects_editor_id ON editing_projects(editor_id);
CREATE INDEX IF NOT EXISTS idx_editing_projects_status ON editing_projects(status);

-- Salaries table
CREATE TABLE IF NOT EXISTS salaries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    amount REAL NOT NULL,
    salary_type TEXT NOT NULL CHECK(salary_type IN ('order_work', 'editing_work', 'transport_work', 'bonus', 'commission')),
    related_order_id TEXT,
    related_project_id TEXT,
    is_paid INTEGER DEFAULT 0,
    paid_date TEXT,
    approved_by TEXT,
    approved_date TEXT,
    description TEXT,
    work_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id),
    FOREIGN KEY (related_order_id) REFERENCES orders(id),
    FOREIGN KEY (related_project_id) REFERENCES editing_projects(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_salaries_employee_id ON salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_salaries_is_paid ON salaries(is_paid);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other')),
    received_by TEXT NOT NULL,
    notes TEXT DEFAULT '',
    shop_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_shop_name ON payments(shop_name);

-- Transportation table
CREATE TABLE IF NOT EXISTS transportation (
    id TEXT PRIMARY KEY,
    related_order_id TEXT,
    related_project_id TEXT,
    client_id TEXT,
    transporter_id TEXT,
    pickup_location TEXT NOT NULL,
    delivery_location TEXT NOT NULL,
    distance REAL DEFAULT 0,
    transport_fee REAL NOT NULL,
    equipment_list TEXT DEFAULT '',
    transport_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in-transit', 'delivered', 'cancelled')),
    instructions TEXT DEFAULT '',
    shop_name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    completed_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (related_order_id) REFERENCES orders(id),
    FOREIGN KEY (related_project_id) REFERENCES editing_projects(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (transporter_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transportation_shop_name ON transportation(shop_name);
CREATE INDEX IF NOT EXISTS idx_transportation_transporter_id ON transportation(transporter_id);
CREATE INDEX IF NOT EXISTS idx_transportation_status ON transportation(status);
