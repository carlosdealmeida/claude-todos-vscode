// Grava os casos de paridade da coluna Sessão do Kairós.
//
// Uso: npm run casos:painel -- --saida <pasta>
//
// Escreve <pasta>/casos-painel.json e <pasta>/casos-tempos.json. O claude-ops
// (Python) e o Kairós (C#) transformam esses arquivos em testes.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gerarCasos } from './casosPainel/cenarios';

const i = process.argv.indexOf('--saida');
const saida = i >= 0 ? process.argv[i + 1] : undefined;
if (!saida) {
  console.error('Uso: npm run casos:painel -- --saida <pasta>');
  process.exit(1);
}

const { painel, tempos } = gerarCasos();
fs.mkdirSync(saida, { recursive: true });
const grava = (nome: string, dados: unknown): string => {
  const destino = path.resolve(saida, nome);
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2) + '\n');
  return destino;
};
console.log(grava('casos-painel.json', painel));
console.log(grava('casos-tempos.json', tempos));
