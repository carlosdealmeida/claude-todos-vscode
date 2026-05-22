# Política de Segurança

**Português** · [English](SECURITY.en.md) · [Español](SECURITY.es.md)

## Versões suportadas

Correções de segurança são aplicadas apenas à versão mais recente publicada no Marketplace.

| Versão | Suporte |
|---|---|
| 0.2.x | ✅ |
| < 0.2 | ❌ |

## Como reportar uma vulnerabilidade

**Não abra uma issue pública** para falhas de segurança.

Use o relato privado de vulnerabilidades do GitHub:

1. Acesse a aba **Security** do repositório.
2. Clique em **Report a vulnerability**.
3. Descreva a falha, o impacto e, se possível, um passo a passo para reproduzir.

Link direto: <https://github.com/carlosdealmeida/claude-todos-vscode/security/advisories/new>

## O que esperar

- **Confirmação de recebimento:** em até 5 dias úteis.
- **Avaliação inicial:** em até 10 dias úteis, com uma estimativa de correção.
- Você é mantido informado sobre o progresso até a resolução.
- Após a correção, publicamos um GitHub Security Advisory creditando quem reportou (salvo pedido de anonimato).

## Escopo

Esta extensão é totalmente local e não se comunica com nenhum servidor. São considerados relevantes, entre outros:

- Execução de código arbitrário a partir de dados lidos dos transcripts do Claude Code.
- Path traversal ou escrita fora dos diretórios esperados.
- Exposição de dados sensíveis (segredos, conteúdo de transcripts) além do necessário.

Fora de escopo: vulnerabilidades em dependências de desenvolvimento que não são embarcadas no `.vsix` publicado.
