export const collection = (db: any, path: string) => path;
export const doc = (db: any, path: string, id?: string) => id ? `${path}/${id}` : path;
export const getDocs = async (query: any) => ({ docs: [], empty: true });
export const getDoc = async (ref: any) => ({ exists: () => false, data: () => ({}) });
export const addDoc = async (ref: any, data: any) => ({ id: 'dummy_id' });
export const updateDoc = async (ref: any, data: any) => {};
export const deleteDoc = async (ref: any) => {};
export const setDoc = async (ref: any, data: any) => {};
export const query = (ref: any, ...ops: any[]) => ref;
export const where = (field: string, op: string, val: any) => ({ field, op, val });
export const orderBy = (field: string, dir?: string) => ({ field, dir });
export const limit = (n: number) => ({ limit: n });
export const serverTimestamp = () => new Date();
export const Timestamp = {
    now: () => ({ toDate: () => new Date() }),
    fromDate: (date: Date) => ({ toDate: () => date })
};
export const runTransaction = async (db: any, updateFunction: any) => {};
export const writeBatch = (db: any) => ({
    set: () => {},
    update: () => {},
    delete: () => {},
    commit: async () => {},
});
export const getFirestore = () => ({});
export const increment = (n: number) => n;
export const arrayUnion = (...args: any[]) => args;
export const arrayRemove = (...args: any[]) => args;

