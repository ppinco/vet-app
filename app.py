import os
import sqlite3
from flask import Flask, jsonify, request, g, render_template, send_from_directory

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vet.db")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS clienti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cognome TEXT NOT NULL,
            telefono TEXT,
            email TEXT,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS listino (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prestazione TEXT NOT NULL,
            prezzo_base REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS visite (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            prestazione_id INTEGER,
            prezzo_applicato REAL NOT NULL,
            data TEXT NOT NULL,
            note TEXT,
            fatturata INTEGER DEFAULT 0,
            FOREIGN KEY (cliente_id) REFERENCES clienti(id),
            FOREIGN KEY (prestazione_id) REFERENCES listino(id)
        );
        """
    )
    conn.commit()
    conn.close()


@app.before_request
def ensure_db():
    init_db()


@app.route("/manifest.json")
def serve_manifest():
    return send_from_directory("static", "manifest.json", mimetype="application/manifest+json")


@app.route("/sw.js")
def serve_sw():
    return send_from_directory("static", "sw.js", mimetype="application/javascript")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/clienti", methods=["GET"])
def list_clienti():
    db = get_db()
    rows = db.execute("SELECT * FROM clienti").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/clienti", methods=["POST"])
def add_cliente():
    data = request.get_json()
    db = get_db()
    cur = db.execute(
        "INSERT INTO clienti (nome, cognome, telefono, email, note) VALUES (?, ?, ?, ?, ?)",
        (data["nome"], data["cognome"], data.get("telefono"), data.get("email"), data.get("note")),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.route("/listino", methods=["GET"])
def list_listino():
    db = get_db()
    rows = db.execute("SELECT * FROM listino").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/listino", methods=["POST"])
def add_prestazione():
    data = request.get_json()
    db = get_db()
    cur = db.execute(
        "INSERT INTO listino (prestazione, prezzo_base) VALUES (?, ?)",
        (data["prestazione"], data["prezzo_base"]),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.route("/visite", methods=["GET"])
def list_visite():
    db = get_db()
    rows = db.execute(
        """
        SELECT v.*, c.nome, c.cognome, l.prestazione
        FROM visite v
        JOIN clienti c ON v.cliente_id = c.id
        LEFT JOIN listino l ON v.prestazione_id = l.id
        """
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/visite", methods=["POST"])
def add_visita():
    data = request.get_json()
    db = get_db()
    cur = db.execute(
        "INSERT INTO visite (cliente_id, prestazione_id, prezzo_applicato, data, note, fatturata) VALUES (?, ?, ?, ?, ?, ?)",
        (
            data["cliente_id"],
            data.get("prestazione_id"),
            data["prezzo_applicato"],
            data["data"],
            data.get("note"),
            data.get("fatturata", 0),
        ),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.route("/fatture")
def fatture():
    return render_template("fatture.html")


@app.route("/clienti/<int:cliente_id>/visite-non-fatturate", methods=["GET"])
def visite_non_fatturate(cliente_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT v.id, v.data, v.prestazione_id, v.prezzo_applicato, v.note,
               l.prestazione
        FROM visite v
        LEFT JOIN listino l ON v.prestazione_id = l.id
        WHERE v.cliente_id = ? AND v.fatturata = 0
        ORDER BY v.data
        """,
        (cliente_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/clienti/<int:cliente_id>/fattura", methods=["POST"])
def fattura_cliente(cliente_id):
    db = get_db()
    db.execute(
        "UPDATE visite SET fatturata = 1 WHERE cliente_id = ? AND fatturata = 0",
        (cliente_id,),
    )
    db.commit()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True)
