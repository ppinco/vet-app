const VetDB = (function () {
  "use strict";

  const DB_NAME = "VetAppDB";
  const DB_VERSION = 1;
  const STORES = ["clienti", "listino", "visite"];
  const SYNC_KEY = "vet_sync_queue";
  const USER_KEY = "vet_user_id";

  let db = null;

  function getUserPrefix() {
    const uid = localStorage.getItem(USER_KEY) || "guest";
    return "vet_data_" + uid;
  }

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
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

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
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

  function addToSyncQueue(action) {
    const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || "[]");
    queue.push({ ...action, timestamp: Date.now() });
    localStorage.setItem(SYNC_KEY, JSON.stringify(queue));
  }

  function getSyncQueue() {
    return JSON.parse(localStorage.getItem(SYNC_KEY) || "[]");
  }

  function clearSyncQueue() {
    localStorage.setItem(SYNC_KEY, "[]");
  }

  async function syncWithServer() {
    if (!navigator.onLine) return false;

    const queue = getSyncQueue();
    if (queue.length === 0) return true;

    let allOk = true;
    for (const action of queue) {
      try {
        if (action.type === "add" && action.store === "clienti") {
          const res = await fetch("/clienti", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.data)
          });
          if (res.ok) {
            const result = await res.json();
            await put("clienti", { ...action.data, id: result.id });
          } else { allOk = false; }
        } else if (action.type === "add" && action.store === "listino") {
          const res = await fetch("/listino", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.data)
          });
          if (res.ok) {
            const result = await res.json();
            await put("listino", { ...action.data, id: result.id });
          } else { allOk = false; }
        } else if (action.type === "add" && action.store === "visite") {
          const res = await fetch("/visite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.data)
          });
          if (res.ok) {
            const result = await res.json();
            await put("visite", { ...action.data, id: result.id });
          } else { allOk = false; }
        } else if (action.type === "fattura") {
          await fetch("/clienti/" + action.clienteId + "/fattura", { method: "POST" });
        }
      } catch (e) {
        allOk = false;
      }
    }

    if (allOk) clearSyncQueue();
    return allOk;
  }

  async function pullFromServer() {
    if (!navigator.onLine) return false;
    try {
      const [clientiRes, listinoRes, visiteRes] = await Promise.all([
        fetch("/clienti"),
        fetch("/listino"),
        fetch("/visite")
      ]);
      if (!clientiRes.ok || !listinoRes.ok || !visiteRes.ok) return false;

      const [clienti, listino, visite] = await Promise.all([
        clientiRes.json(),
        listinoRes.json(),
        visiteRes.json()
      ]);

      await putAll("clienti", clienti);
      await putAll("listino", listino);

      const localVisite = await getAll("visite");
      const localIds = new Set(localVisite.map((v) => v.id));
      for (const v of visite) {
        if (!localIds.has(v.id)) {
          await put("visite", v);
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    open,
    getAll,
    get,
    put,
    putAll,
    clearStore,
    nextId,
    addToSyncQueue,
    getSyncQueue,
    clearSyncQueue,
    syncWithServer,
    pullFromServer,
    getUserPrefix,
    setUser: (id) => localStorage.setItem(USER_KEY, id),
    getUser: () => localStorage.getItem(USER_KEY) || null
  };
})();
