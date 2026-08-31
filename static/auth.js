const VetAuth = (function () {
  "use strict";
  let currentUser = null;
  const onAuthChange = [];

  function init() {
    const savedUser = localStorage.getItem("vet_local_user");
    if (savedUser) {
      currentUser = { name: savedUser, id: savedUser };
      if (typeof VetDB !== 'undefined' && VetDB.setUser) VetDB.setUser(savedUser);
    }
    setTimeout(notifyChange, 50);
  }

  function login() {
    const nome = prompt("Inserisci il tuo nome per accedere (es. Laura):");
    if (nome && nome.trim() !== "") {
      const userStr = nome.trim();
      localStorage.setItem("vet_local_user", userStr);
      currentUser = { name: userStr, id: userStr };
      if (typeof VetDB !== 'undefined' && VetDB.setUser) VetDB.setUser(userStr);
      notifyChange();
    }
  }

  function logout() {
    localStorage.removeItem("vet_local_user");
    currentUser = null;
    if (typeof VetDB !== 'undefined' && VetDB.setUser) VetDB.setUser(null);
    notifyChange();
  }

  function getUser() { return currentUser; }
  function isLoggedIn() { return !!currentUser; }
  function onAuthChangeCallback(fn) { onAuthChange.push(fn); }
  function notifyChange() { onAuthChange.forEach((fn) => fn(currentUser)); }

  return { init, login, logout, getUser, isLoggedIn, onAuthChange: onAuthChangeCallback };
})();
