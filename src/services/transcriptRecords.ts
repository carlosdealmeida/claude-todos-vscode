// R7/R4: records api-request, api-request-blob e api-request-shape (2.1.300).
// Nenhum leitor usa, e no modo auto o api-request chega a centenas de KB por
// linha (#102452). O Claude Code grava `type` como primeira chave, então o
// prefixo basta para pular o JSON.parse; com outra ordem de chaves só o atalho
// se perde, porque os leitores ainda filtram por `type`.
const API_REQUEST_PREFIX = '{"type":"api-request';

export function isApiRequestLine(line: string): boolean {
  return line.startsWith(API_REQUEST_PREFIX);
}
