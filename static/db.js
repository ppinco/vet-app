const VetDB = (function () {
  "use strict";

  const DB_PREFIX = "VetAppDB_";
  const STORES = ["clienti", "listino", "visite"];
  const USER_KEY = "vet_user_id";

  let db = null;
  let currentUser = localStorage.getItem(USER_KEY) || "guest";

  function setUser(userId) {
    currentUser = userId || "guest";
    localStorage.setItem(USER_KEY, currentUser);
    db = null; // Forza la riapertura del DB per il nuovo utente
  }

  function getUser() {
    return localStorage.getItem(USER_KEY) || "guest";
  }

  function open() {
    if (db) return Promise.resolve(db);
    const dbName = DB_PREFIX + getUser();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        STORES.forEach((s) => {
          if (!d.objectStoreNames.contains(s)) {
            const store = d.createObjectStore(s, { keyPath: "id" });
            if (s === "visite") {
              store.createIndex("cliente_id", "cliente_id", { unique: false });
              store.createIndex("fatturata", "fatturata", { unique: false });
            }
          }
        });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function getAll(storeName) {
    return open().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(storeName, "readonly").objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function get(storeName, id) {
    return open().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(storeName, "readonly").objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function put(storeName, item) {
    return open().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(storeName, "readwrite").objectStore(storeName).put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function putAll(storeName, items) {
    return open().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function deleteItem(storeName, id) {
    return open().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  function clearStore(storeName) {
    return open().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(storeName, "readwrite").objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  function nextId(storeName) {
    return getAll(storeName).then((items) => {
      if (items.length === 0) return 1;
      return Math.max(...items.map((i) => i.id)) + 1;
    });
  }

  async function exportJSON() {
    return {
      clienti: await getAll("clienti"),
      listino: await getAll("listino"),
      visite: await getAll("visite"),
      exported_at: new Date().toISOString()
    };
  }

  async function importJSON(data) {
    if (data.clienti) await putAll("clienti", data.clienti);
    if (data.listino) await putAll("listino", data.listino);
    if (data.visite) await putAll("visite", data.visite);
    return true;
  }

  async function getVisiteNonFatturate(clienteId) {
    const visite = await getAll("visite");
    const listino = await getAll("listino");
    const listinoMap = new Map(listino.map(p => [p.id, p.prestazione]));

    return visite
      .filter(v => v.cliente_id === parseInt(clienteId, 10) && v.fatturata === 0)
      .map(v => ({
        ...v,
        prestazione: v.prestazione_id ? listinoMap.get(v.prestazione_id) : null
      }));
  }

  return {
    open,
    getAll,
    get,
    put,
    putAll,
    deleteItem,
    clearStore,
    nextId,
    exportJSON,
    importJSON,
    getVisiteNonFatturate,
    setUser,
    getUser
  };
})();
