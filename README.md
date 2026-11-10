# A11y-Orchestra

[![WCAG 2.2](https://img.shields.io/badge/WCAG-2.2_AA_%26_AAA-005A9C?style=flat-square)](https://www.w3.org/TR/WCAG22/)
[![n8n](https://img.shields.io/badge/Orchestration-n8n_v1.117-EA4B71?style=flat-square)](https://n8n.io)
[![Docker](https://img.shields.io/badge/Container-Docker_Compose-2496ED?style=flat-square)](https://www.docker.com/)
[![Playwright](https://img.shields.io/badge/Engine-Playwright-2EAD33?style=flat-square)](https://playwright.dev/)
[![Qdrant](https://img.shields.io/badge/Vector_DB-Qdrant-dc2626?style=flat-square)](https://qdrant.tech/)
[![OpenAI](https://img.shields.io/badge/LLM-GPT--4o_Vision-412991?style=flat-square)](https://openai.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Academic](https://img.shields.io/badge/HTWK_Leipzig-B.Sc._Medieninformatik-003366?style=flat-square)](https://www.htwk-leipzig.de/)

Orchestriertes Multi-Agenten-System zur automatisierten Prüfung digitaler Web-Accessibility. Das System kombiniert regelbasierte Test-Runner (Pa11y, axe-core) mit multimodalen LLMs und RAG auf Basis von n8n, um kontextabhängige Barrieren nach WCAG 2.2 reproduzierbar zu identifizieren.

Entwickelt als Bachelorarbeit im Studiengang Medieninformatik an der HTWK Leipzig.


## Kernmerkmale

- **Hybrides Audit-Modell**: Syntaktische Regelprüfungen (axe-core, Pa11y) werden mit semantischer visueller Analyse (GPT-4o Vision) verknüpft, um bisher rein manuell prüfbare Kriterien automatisiert abzudecken.
- **Supervisor-Worker-Architektur**: Ein zentraler Manager-Agent steuert spezialisierte Worker bedarfsgerecht und aggregiert die Einzelergebnisse.
- **RAG-gestützte Behebung**: Eine Qdrant-Vektordatenbank mit indizierten WCAG-2.2-Spezifikationen liefert semantisch passende Codebeispiele und Sanierungsempfehlungen.
- **Automatisierte PDF-Berichte**: Generierung strukturierter Einzelberichte pro Prüfbereich sowie eines konsolidierten Management-Reports via `pdf-lib`.


## Motivation

Der Ausgangspunkt war ein Fachwebinar zur digitalen Barrierefreiheit während einer Tätigkeit in einer Digitalagentur. Der zugrunde liegende *WebAIM Million Report* belegt: Über 90 Prozent der meistbesuchten Websites weisen automatisiert erkennbare WCAG-Verstöße auf, wobei die Fehlerquote seit Jahren stagniert.

Klassische Audit-Werkzeuge wie axe-core oder Pa11y sind effektiv bei syntaktischer Code-Analyse, scheitern jedoch systembedingt an visuellen und kontextabhängigen Anforderungen:
- Ist ein Tastaturfokus-Indikator tatsächlich sichtbar oder wird er durch Sticky-Elemente verdeckt?
- Bietet ein Authentifizierungs-Schritt eine barrierefreie Alternative zu kognitiven Funktionstests?

Solche Lücken erforderten bislang aufwändige manuelle Prüfungen. **A11y-Orchestra** schließt diese semantische Lücke durch den gezielten Einsatz multimodaler KI-Agenten und macht standardisierte Barrierefreiheitstests für Entwicklungsteams ohne tiefes Vorwissen zugänglich.


## Systemarchitektur

Das System implementiert das **Supervisor-Worker-Pattern** über drei operative Ebenen:

![Systemarchitektur](architecture.png)

### 1. Orchestration Layer

Einstiegspunkt ist ein interaktives Interface. Der vorgeschaltete Workflow `URLCheck` validiert und normalisiert die Ziel-URL (Entfernung von PII und Tracking-Parametern). Der `Manager-Agent` (GPT-4o, Memory Buffer) steuert den Ablauf: Er wählt zielgerichtet Worker-Agenten aus, evaluiert Zwischenstände und fragt bei Bedarf die Wissensbasis ab.

### 2. Specialized Agent Layer

Die Worker-Agenten sind eigenständige n8n-Sub-Workflows, die vom Manager über Tool-Schnittstellen instanziiert werden:

- **GAA (General Accessibility Agent)**: Führt axe-core und Pa11y im Headless-Browser aus. GPT-4o-mini analysiert und priorisiert Verstöße gegen WCAG 2.5.8 (Target Size Minimum).
- **VFA (Visual Focus Agent)**: Navigiert interaktive DOM-Elemente via Playwright, erzeugt Screenshots und prüft per Vision-Modell, ob aktive Fokus-Zustände durch Overlays, Modals oder Sticky-Header verdeckt werden (WCAG 2.4.11 / 2.4.12).
- **CSA (Cognitive Security Agent)**: Überprüft Authentifizierungs- und Anmeldeseiten auf kognitive Barrieren (CAPTCHAs, Rätsel) und verifiziert das Vorhandensein barrierefreier Alternativen (WCAG 3.3.8 / 3.3.9).
- **RAG-Agent (WCAG Knowledge Base)**: Vektorielle Wissensbasis. Der Ingest-Pfad verarbeitet die W3C-WCAG-2.2-Dokumentation in Chunks und speichert Embeddings in Qdrant. Der Query-Pfad liefert dem Manager präzise Handlungs- und Code-Empfehlungen.

### 3. Infrastructure & Reporting Layer

- **Chat-Interface**: Steuerung, Statusausgabe und interaktive Abfrage.
- **PDF-Reporting**: Jeder Agent erzeugt über `pdf-lib` einen normierten Einzelbericht. Der Manager führt alle Teilergebnisse in einem konsolidierten Abschlussbericht zusammen.


## Tech Stack

| Komponente | Technologie | Version / Typ | Zweck |
| :--- | :--- | :--- | :--- |
| **Orchestrierung** | n8n (Self-Hosted) | v1.117.3 | Workflow- und Agentensteuerung |
| **Vektordatenbank** | Qdrant | latest (Docker) | Speicherung von WCAG-Dokument-Embeddings |
| **LLMs** | OpenAI GPT-4o / GPT-4o-mini | Chat & Vision APIs | Visuelle Inspektion, Entscheidungsfindung, RAG |
| **Automatisierung** | Playwright / Puppeteer-Core | v1.56.1 / v22 | DOM-Extraktion, Navigation, Screenshots |
| **Regel-Runner** | axe-core / Pa11y | v4.10 / v9.0 | Syntaktische WCAG-Validierung |
| **PDF-Erstellung** | pdf-lib | v1.17.1 | Generierung vektorbasierten Reportings |
| **Runtime** | Node.js | v20 (Bullseye Slim) | Ausführungsumgebung |


## Repository-Struktur

```text
a11y-orchestra/
├── .github/              # CI/CD und Repository-Konfiguration
├── agent-reports/        # Generierte Beispiel-PDFs realer Audit-Läufe
│   ├── csa-2025-11-20.pdf
│   ├── gaa-2025-11-20.pdf
│   ├── vfa-2025-11-20.pdf
│   └── manager-2025-11-20.pdf
├── runner/               # Node.js-Runner für Headless-Browser und Accessibility-Engines
│   ├── axe-playwright-runner.js
│   ├── axe-puppeteer-runner.js
│   ├── pa11y-runner.js
│   └── playwright-runner.js
├── workflows/            # n8n-Workflow-Exporte (JSON)
│   ├── A11y-Orchestra.json
│   ├── CSA.json
│   ├── GAA.json
│   ├── RAG-Agent.json
│   └── VFA.json
├── architecture.png      # Architekturskizze des Gesamtsystems
├── docker-compose.yml    # Multi-Container-Orchestrierung (n8n + Qdrant)
├── Dockerfile            # Container-Image mit Playwright, n8n und Runnern
├── package.json          # Node.js-Projektabhängigkeiten
├── package-lock.json     # Deterministische Dependency-Pins
├── prompts.md            # Dokumentation der System-Prompts aller Agenten
├── .env.example          # Vorlage für Umgebungsvariablen
└── LICENSE               # MIT-Lizenz
```


## Installation und Setup

### Voraussetzungen

- Docker und Docker Compose
- OpenAI API Key

### Schnellstart

1. **Repository klonen und vorbereiten:**
   ```bash
   git clone https://github.com/blokkfreak/a11y-orchestra.git
   cd a11y-orchestra
   ```

2. **Umgebungsvariablen konfigurieren:**
   ```bash
   cp .env.example .env
   ```
   Trage deinen `OPENAI_API_KEY` in der `.env`-Datei ein.

3. **Container-Stack starten:**
   ```bash
   docker compose up -d --build
   ```

4. **Workflows in n8n laden:**
   - Öffne `http://localhost:5678` im Browser.
   - Importiere die JSON-Dateien aus dem Verzeichnis `workflows/`.
   - Starte den RAG-Ingest-Workflow einmalig, um die Qdrant-Vektordatenbank mit den WCAG-Dokumenten zu initialisieren.

> Hinweis: Alle produktiven API-Keys, Credential-IDs und Drive-Pfade in den Workflow-Dateien wurden vor dem Commit durch neutrale Platzhalter ersetzt.


## Evaluation und Ergebnisse

- **Testumgebungen**: Validiert an kontrollierten Testdaten (W3C Web Accessibility Initiative Demos) sowie realen Produktionssystemen (unter anderem HTWK Leipzig, Dev.to, Slack Web).
- **Fehlerbehandlung**: Implementierte Retry-Loops und Validierungsfilter im Supervisor fangen unvollständige LLM-Antworten ab.
- **Edge-Cases**: Robuste Behandlung dynamischer DOM-Veränderungen bei Single Page Applications (SPAs) sowie Viewport-Verschiebungen durch Sticky-Navigationselemente.


## Lizenz

Dieses Projekt ist unter der [MIT-Lizenz](LICENSE) lizenziert.
