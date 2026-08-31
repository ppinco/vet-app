const VetAuth = (function () {
  "use strict";

  const USER_KEY = "vet_user_id";
  const USER_NAME_KEY = "vet_user_name";
  const onAuthChange = [];

  function login() {
    const name = prompt("Inserisci il tuo nome profilo (es. Giulia):");
    if (!name || name.trim() === "") return;
    
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
    localStorage.setItem(USER_KEY, id);
    localStorage.setItem(USER_NAME_KEY, name.trim());
    
    if (typeof VetDB !== "undefined") {
      VetDB.setUser(id);
    }
    notifyChange();
  }

  function logout() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    if (typeof VetDB !== "undefined") {
      VetDB.setUser(null);
    }
    notifyChange();
  }

  function getUser() {
    const id = localStorage.getItem(USER_KEY);
    const name = localStorage.getItem(USER_NAME_KEY);
    if (!id) return null;
    return { id, name };
  }

  function isLoggedIn() {
    return !!localStorage.getItem(USER_KEY);
  }

  function onAuthChangeCallback(fn) {
    onAuthChange.push(fn);
    // Invia subito lo stato corrente al callback appena registrato
    fn(getUser());
  }

  function notifyChange() {
    const user = getUser();
    onAuthChange.forEach((fn) => fn(user));
  }

  function init() {
    // Non serve caricare SDK esterni, l'inizializzazione controlla solo lo stato locale
    notifyChange();
  }

  return {
    init,
    login,
    logout,
    getUser,
    isLoggedIn,
    onAuth: onAuthChangeCallback
  };
})();
