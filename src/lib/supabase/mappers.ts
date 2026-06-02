// Table name and field mapping utilities for Supabase ↔ frontend compatibility

export const collection = (dbOrPath: any, path?: string) => {
    const actualPath = path || dbOrPath;
    if (actualPath === 'orderItems') return 'order_items';
    if (actualPath === 'inventoryMovements') return 'inventory_movements';
    return actualPath;
};

export const doc = (dbOrPath: any, pathOrId?: string, id?: string) => {
    let table = dbOrPath;
    let docId = pathOrId;
    if (id !== undefined) {
        // called as doc(db, path, id)
        table = pathOrId;
        docId = id;
    }
    
    if (table === 'orderItems') table = 'order_items';
    if (table === 'inventoryMovements') table = 'inventory_movements';
    return docId ? `${table}/${docId}` : table;
};

// Helper to map frontend camelCase fields back to database column names
export function mapColumnToDb(table: string, field: string): string {
    if (table === 'orders') {
        if (field === 'orderDate') return 'created_at';
        if (field === 'orderStatus') return 'status';
        if (field === 'paymentType') return 'payment_method';
        if (field === 'shippingFee') return 'shipping_fee';
        if (field === 'totalAmount') return 'total_amount';
    }
    if (table === 'customers') {
        if (field === 'firstName' || field === 'lastName') return 'full_name';
    }
    return field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Helper to map Supabase snake_case to frontend camelCase
export function mapResult(table: string, data: any): any {
    if (!data) return data;
    if (Array.isArray(data)) return data.map(item => mapResult(table, item));

    const mapped: any = { ...data };
    
    // Automatic snake_case to camelCase conversion
    Object.keys(data).forEach(key => {
        const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        if (camelKey !== key) {
            mapped[camelKey] = data[key];
        }
    });

    // Special mappings for legacy compatibility
    if (table === 'orders') {
        if (data.created_at) mapped.orderDate = data.created_at;
        if (data.status) mapped.orderStatus = data.status;
        if (data.payment_method) mapped.paymentType = data.payment_method;
        if (data.shipping_fee) mapped.shippingFee = Number(data.shipping_fee);
        if (data.total_amount) mapped.totalAmount = Number(data.total_amount);
    }
    
    if (table === 'customers') {
        if (data.full_name) {
            const parts = data.full_name.split(' ');
            mapped.firstName = parts[0] || '';
            mapped.lastName = parts.slice(1).join(' ') || '';
        }
    }

    if (table === 'products') {
        if (data.selling_price !== undefined && data.selling_price !== null) {
            mapped.sellingPrice = Number(data.selling_price);
        } else if (data.price !== undefined && data.price !== null) {
            // Fallback for scraped string prices if selling_price is empty
            const num = parseFloat(data.price);
            mapped.sellingPrice = isNaN(num) ? 0 : num;
        }
        
        if (data.stock_level !== undefined && data.stock_level !== null) {
            mapped.quantityOnHand = Number(data.stock_level);
        }
    }

    return mapped;
}
