// src/shims/async-storage.ts (browser stub for RN async-storage)
export default {
  getItem: async (_key: string) => null,  // Use localStorage if needed: localStorage.getItem(key)
  setItem: async (_key: string, _value: string) => {},  // localStorage.setItem(key, value)
  removeItem: async (_key: string) => {},  // localStorage.removeItem(key)
};