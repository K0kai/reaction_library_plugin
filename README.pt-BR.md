# Reaction Library para Vencord, Dorion e Equicord

[Read in English](README.md)

O botão no chat abre uma biblioteca no estilo do Discord. O plugin independente para Dorion usa **Add folder** para guardar referências a imagens, GIFs, vídeos e áudios nas pastas originais. A importação mostra o progresso e exibe os itens em lotes de 20. É possível pesquisar nomes, caminhos e etiquetas, filtrar por pasta ou tipo de mídia e ordenar por nome ou data de importação. Clicar em um cartão envia o arquivo original para a conversa atual.

## Plugin independente para Dorion

Mantenha o Equicord integrado ao Dorion ativado. Copie **apenas** `dorion/reaction-library.js` para `%USERPROFILE%\dorion\plugins` no Windows, ou abra a pasta de plugins nas configurações do Dorion. Ative o plugin e reinicie o Dorion. Ele aparece como botão no chat, não na lista de plugins do Equicord. Se você instalou o pacote antigo, remova `Equicord-ReactionLibrary.js` da pasta de plugins e `Equicord-ReactionLibrary.css` da pasta de temas.

As referências persistentes dependem do seletor de pastas do Dorion. Ao abrir a biblioteca, o plugin tenta recuperar o acesso às pastas salvas. Se houver uma solicitação de permissão, aprove-a. Se a recuperação automática falhar, use **Restore access**. Para pastas ausentes ou ilegíveis, **Select folder again** reconecta as referências e preserva as etiquetas. Mover ou apagar um arquivo original torna a referência indisponível até a pasta ser selecionada novamente.

Na primeira abertura após esta atualização, uma limpeza única remove cópias antigas de mídia armazenadas pelo plugin, inclusive sobras de importações interrompidas. Referências, pastas, etiquetas e arquivos originais permanecem intactos. Itens que dependiam apenas das cópias removidas saem do índice.

As miniaturas de imagens e vídeos são carregadas perto da área visível, com no máximo três leituras simultâneas. Vídeos exibem um quadro sem reprodução automática. A lista começa com 60 itens; **Show more** carrega mais. Vídeos com codecs não suportados continuam identificados como vídeos.

Clicar no cartão envia o arquivo original imediatamente. Em cartões de áudio e vídeo, **Preview** abre controles de reprodução sem enviar. **Send as voice** envia uma mensagem de voz com duração e forma de onda. Vídeos também oferecem **Send as GIF**. As conversões ficam apenas na memória para envio; o original não é modificado.

Áudio OGG Opus existente é usado diretamente para mensagens de voz. Outros áudios decodificáveis são convertidos para Opus mono quando o Dorion oferece suporte ao WebCodecs. Para vídeos, o plugin tenta decodificar o áudio diretamente e, se necessário, capturá-lo em memória. Essa alternativa leva aproximadamente a duração do vídeo, reproduz sem som e mostra o progresso. Vídeos sem faixa de áudio decodificável geram erro. As permissões do canal para mensagens de voz continuam aplicáveis.

A conversão para GIF usa a duração inteira do vídeo, com lado maior de até 480 pixels, até 10 quadros por segundo e limite de 900 quadros. Vídeos longos usam menos quadros por segundo. Há indicação de progresso e **Cancel conversion**. Conversões acima de 64 MiB param com erro; o limite de upload do Discord também se aplica. O codificador de GIF já vem incluído no plugin.

Fechar a biblioteca não interrompe conversões ou envios enquanto o Dorion estiver aberto. Um ponto no botão do chat indica envio pendente; passe o cursor para ver o estado. Reabra a biblioteca para acompanhar ou cancelar a conversão. A conclusão envia para a conversa escolhida originalmente, mesmo se você mudar de conversa. Fechar o Dorion encerra essas tarefas em memória.

Arraste o canto superior esquerdo para redimensionar a biblioteca. O tamanho fica salvo; a grade se ajusta à largura. Também é possível usar as setas do teclado quando o controle de tamanho estiver focado.

**Remove** tira um item do índice; **Remove folder** tira os itens de uma pasta e de suas subpastas. Os arquivos originais não são apagados. Adicione a pasta novamente para atualizar o índice; ele não acompanha mudanças no sistema de arquivos em tempo real.

O código compartilhado fica em `src/reaction-library.js`. Depois de editá-lo, execute `node build.mjs` para gerar os pacotes Dorion e Vencord. A compilação usa ferramentas de desenvolvimento de um checkout vizinho do Equicord. Esse checkout não é necessário para instalar o pacote Vencord gerado.

## Plugin para Vencord

Para Windows x64 com Vencord já instalado, abra `releases/ReactionLibrary-Setup.exe`, escolha Português (Brasil) e clique em **Baixar e instalar**. O programa baixa a versão mais recente publicada no GitHub, verifica os hashes SHA-256 e abre a revisão da instalação. O instalador compila separadamente e faz cópias de segurança antes de alterar os arquivos. **Restaurar instalação anterior** recupera a versão salva. Consulte [o guia do instalador](installer/README.pt-BR.txt) para requisitos e limitações.

Para gerar novamente o ZIP e o executável, execute `powershell -NoProfile -ExecutionPolicy Bypass -File package-windows.ps1`. Publique o EXE, o ZIP e os dois arquivos `.sha256` na mesma versão do GitHub. Para verificar instalação e atualização com dados simulados, execute `test/installer.test.ps1` e `test/installer-bootstrap.test.ps1`. O iniciador exige uma versão pública do GitHub com hashes SHA-256 dos arquivos publicados.

A atualização automática do Vencord é desativada nas compilações feitas pelo instalador. Instalações com código-fonte ou plugins personalizados devem corresponder à revisão testada; mudanças de versão aparecem antes da aprovação. Compilações que perderiam plugins nativos são recusadas. A versão de prévia não é assinada, a menos que seja empacotada com um certificado. Consulte [as verificações de lançamento](installer/RELEASING.md). Os testes automatizados não substituem um ciclo de instalação, atualização e restauração em uma máquina virtual Windows.

O instalador reutiliza ferramentas em cache depois de verificar cada arquivo. Instalações bem-sucedidas removem arquivos temporários da compilação; instalações com código-fonte personalizado mantêm uma cópia desse código para atualizações futuras. Ferramentas verificadas e cópias de segurança permanecem. São necessários 4 GB livres durante a compilação. `test/installer-storage.test.ps1` verifica cache, limpeza e tratamento de links de diretório.

O plugin Vencord completo fica em `vencord/reactionLibrary/`. Para instalação manual, copie toda a pasta para `Vencord/src/userplugins/reactionLibrary/` e recompile o Vencord. A pasta inclui o acesso nativo a arquivos e o codificador de GIF; não exige Equicord. No Vencord para desktop, o plugin guarda os caminhos das pastas selecionadas e lê os arquivos originais quando necessário. O componente nativo não salva mídias convertidas nem copia os arquivos importados.

## Implementação anterior para Equicord

Para uma compilação desktop normal, copie `index.tsx` e `styles.css` para `src/userplugins/reactionLibrary` em um checkout do Equicord e compile-o. Com as dependências do Equicord instaladas numa pasta vizinha, execute `node check.mjs` aqui para conferir os tipos sem copiar arquivos.

Essa implementação anterior ainda usa cópias de mídia e não inclui as conversões do plugin Dorion independente. GIFs aparecem no filtro de imagens. Execute `node --test test/standalone.test.cjs` para verificar importação, prévias, remoção, conversões e envio.

Os metadados usam `Devs.Ven` provisoriamente porque não foi informada uma identidade de colaborador. Substitua essa entrada antes de distribuir o plugin Equicord.

## Desenvolvimento e licença

Clone este repositório e o Equicord lado a lado e instale as dependências do Equicord conforme a documentação dele. Execute `node build.mjs` para gerar os pacotes atuais e `node --test test/*.test.cjs` para os testes. Execute o ESLint do Equicord com este repositório como pasta de trabalho para verificar `src/reaction-library.js`.

Licenciado sob GPL-3.0-or-later. O plugin independente também inclui gifenc sob licença MIT, incorporada ao arquivo gerado. O plugin independente é a versão em desenvolvimento ativo; o código-fonte para Equicord é uma implementação anterior.
