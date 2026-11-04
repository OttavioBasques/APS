# Fonte do documento da APS

- `conteudo.js` – todo o texto do documento (edite aqui quando o app mudar).
- `gerar.js` – monta o .docx (Arial 12, espaçamento 1,5, margens de 2,5 cm, A4, capa, índice, ficha APS).
- `build.sh` – gera em duas passagens (a segunda preenche as páginas do índice). Requer Node (pacote `docx`), LibreOffice e poppler.
- `img/*.mmd` – diagramas em Mermaid (renderizar com `mmdc -i arq.mmd -o arq.png -c cfg.json -s 3 -b white`).
