const VetAuth = (function () {
  "use strict";

  let tokenClient = null;
  let accessToken = null;
  let currentUser = null;
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const CLIENT_ID = "";
  const onAuthChange = [];

  function init(clientId) {
    if (!clientId) return;
    CLIENT_ID_VAL = clientId;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (resp) => {
          if (resp.access_token) {
            accessToken = resp.access_token;
            fetchUserInfo();
          }
        }
      });
    };
    document.head.appendChild(script);
  }

  let CLIENT_ID_VAL = "";

  function login() {
    if (!tokenClient) return;
    tokenClient.requestAccessToken();
  }

  function logout() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    currentUser = null;
    VetDB.setUser(null);
    notifyChange();
  }

  async function fetchUserInfo() {
    if (!accessToken) return;
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: "Bearer " + accessToken }
      });
      if (res.ok) {
        currentUser = await res.json();
        VetDB.setUser(currentUser.id);
        notifyChange();
      }
    } catch (e) {
      console.error("Failed to fetch user info", e);
    }
  }

  function getUser() { return currentUser; }
  function getToken() { return accessToken; }
  function isLoggedIn() { return !!accessToken; }

  function onAuthChangeCallback(fn) { onAuthChange.push(fn); }
  function notifyChange() { onAuthChange.forEach((fn) => fn(currentUser)); }

  async function backupToDrive() {
    if (!accessToken || !currentUser) return { ok: false, error: "Non autenticato" };

    const data = {
      clienti: await VetDB.getAll("clienti"),
      listino: await VetDB.getAll("listino"),
      visite: await VetDB.getAll("visite"),
      exported_at: new Date().toISOString()
    };

    const fileName = "vet_backup_" + currentUser.id + ".json";
    const fileContent = JSON.stringify(data, null, 2);

    try {
      const existingFileId = await findBackupFile(fileName);
      if (existingFileId) {
        await updateDriveFile(existingFileId, fileContent);
      } else {
        await createDriveFile(fileName, fileContent);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function restoreFromDrive() {
    if (!accessToken || !currentUser) return { ok: false, error: "Non autenticato" };

    const fileName = "vet_backup_" + currentUser.id + ".json";
    try {
      const fileId = await findBackupFile(fileName);
      if (!fileId) return { ok: false, error: "Nessun backup trovato su Google Drive" };

      const res = await fetch(
        "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media",
        { headers: { Authorization: "Bearer " + accessToken } }
      );
      if (!res.ok) throw new Error("Errore download");

      const data = await res.json();

      if (data.clienti) await VetDB.putAll("clienti", data.clienti);
      if (data.listino) await VetDB.putAll("listino", data.listino);
      if (data.visite) await VetDB.putAll("visite", data.visite);

      return { ok: true, count: (data.clienti || []).length + (data.listino || []).length + (data.visite || []).length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function findBackupFile(fileName) {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent("name='" + fileName + "' and trashed=false") +
        "&fields=files(id)",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  }

  async function createDriveFile(name, content) {
    const metadata = { name: name, mimeType: "application/json" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([content], { type: "application/json" }));

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      { method: "POST", headers: { Authorization: "Bearer " + accessToken }, body: form }
    );
    if (!res.ok) throw new Error("Errore creazione file su Drive");
  }

  async function updateDriveFile(fileId, content) {
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media",
      {
        method: "PATCH",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: content
      }
    );
    if (!res.ok) throw new Error("Errore aggiornamento file su Drive");
  }

  return {
    init,
    login,
    logout,
    getUser,
    getToken,
    isLoggedIn,
    onAuthChange: onAuthChangeCallback,
    backupToDrive,
    restoreFromDrive
  };
})();
