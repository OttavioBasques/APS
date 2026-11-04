# Descobre em que página cada título caiu (para o índice). Uso: python3 paginas.py doc.pdf > paginas.json
import json, subprocess, sys, re
pdf = sys.argv[1]
n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
heads = json.loads(subprocess.run(['node', '-e', "const {secoes}=require('./conteudo.js');console.log(JSON.stringify(secoes.filter(b=>b[0]==='h1'||b[0]==='h2').map(b=>b[1])))"], capture_output=True, text=True).stdout)
heads.append('FICHA DAS ATIVIDADES PRÁTICAS SUPERVISIONADAS – APS')
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
pages = [norm(subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), pdf, '-'], capture_output=True, text=True).stdout) for i in range(1, n + 1)]
out, start = {}, 3  # pula capa e índice
for h in heads:
    for i in range(start, n + 1):
        if norm(h) in pages[i - 1]:
            out[h] = i; start = i; break
    else:
        print('NAO ACHEI', h, file=sys.stderr)
out['FICHA DE ATIVIDADES PRÁTICAS SUPERVISIONADAS'] = out.pop('FICHA DAS ATIVIDADES PRÁTICAS SUPERVISIONADAS – APS', '')
print(json.dumps(out, ensure_ascii=False, indent=1))
