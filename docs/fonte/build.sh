#!/bin/bash
# Gera o .docx em duas passagens (a segunda preenche os números do índice)
set -e
cd "$(dirname "$0")"
node gerar.js APS_Respira_Urbana.docx
soffice --headless --convert-to pdf APS_Respira_Urbana.docx >/dev/null 2>&1
python3 paginas.py APS_Respira_Urbana.pdf > paginas.json
node gerar.js APS_Respira_Urbana.docx paginas.json
soffice --headless --convert-to pdf APS_Respira_Urbana.docx >/dev/null 2>&1
pdfinfo APS_Respira_Urbana.pdf | grep Pages
