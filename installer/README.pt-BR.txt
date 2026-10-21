REACTION LIBRARY - INSTALADOR DE PRÉVIA PARA VENCORD

1. Feche o Discord por completo, inclusive na bandeja. O Vencord já deve estar instalado.
2. Abra ReactionLibrary-Setup.exe, escolha Português (Brasil) e clique em
   Baixar e instalar. O programa baixa e verifica a versão pública mais recente
   do GitHub. Como alternativa, extraia o ZIP e abra Instalar-pt-BR.cmd.
3. Confira a pasta de recursos do Discord detectada. Escolha outra, se necessário.
4. Se houver plugins personalizados, selecione o código-fonte correspondente do
   Vencord caso o instalador não o encontre automaticamente.
5. Clique em Revisar / Instalar. Confira as versões antiga e nova e os caminhos
   afetados. Aprove a alteração e aguarde compilação, verificação, cópia de
   segurança e instalação.
6. Reinicie o Discord. Ative ReactionLibrary em Configurações > Vencord > Plugins.

O QUE MUDA

Este pacote exige Discord para Windows x64 com uma instalação existente e
reconhecida do Vencord. Ele mantém o carregador do Discord e atualiza somente a
pasta dist compilada que esse carregador já utiliza. Não instala outro mod nem
modifica novamente o Discord. Instale primeiro o Vencord oficial em vencord.dev.
Carregadores desconhecidos, compartilhamentos de rede, pastas vinculadas e
mapas de código-fonte ausentes são recusados. Este instalador não oferece suporte
a Dorion, Vesktop, ARM64 ou clientes em navegador.

Plugins nativos permanecem incluídos. Configurações e temas ficam nos caminhos
atuais e também recebem cópias de segurança. A nova compilação usa a revisão
testada b0e636d do Vencord, além de versões fixas de Node, Git, pnpm e das
dependências. Se a instalação atual tiver outra versão, a mudança aparecerá
na revisão. O instalador recusa uma compilação que perderia algum arquivo de
plugin nativo. Uma versão oficial mais recente pode exigir aguardar outro pacote.

Instalações com código-fonte ou plugins personalizados devem corresponder à
revisão testada. Uma cópia separada do código-fonte inclui alterações locais e
outros plugins personalizados; .git, node_modules e resultados de compilações
anteriores ficam de fora. O código-fonte original não é editado. A pasta dist
usada pelo Discord é substituída. Ausência do código-fonte personalizado ou
arquivos vinculados impede a instalação. Se a compilação falhar, os arquivos
ativos não são alterados.

O instalador cria uma cópia de segurança e um registro de recuperação antes de
trocar a compilação. Ele verifica se o Discord está fechado e se a compilação e
o carregador não mudaram. Uma interrupção durante a troca pode exigir o botão
de restauração. Nenhuma pasta da instalação ativa é apagada recursivamente.
As cópias para reversão são mantidas.

RESTAURAÇÃO

Feche o Discord, abra Instalar-pt-BR.cmd e clique em Restaurar instalação anterior.
Confira a cópia identificada na janela de revisão. A restauração verifica os
hashes e recupera compilação, configurações e temas salvos. Configurações e
temas alterados depois da instalação são preservados numa pasta de resgate.
O carregador do Discord permanece intacto. Se o Discord ou o carregador mudou,
a restauração automática para. Nesse caso, repare a instalação com o instalador
oficial do Vencord.

Cópias de segurança, registros, compilações, ferramentas e o registro de
recuperação ficam em:
  %LOCALAPPDATA%\ReactionLibrarySetup
Não apague as cópias de segurança enquanto precisar da restauração. São
necessários pelo menos 4 GB livres durante a compilação. Esse espaço é temporário.
Depois de uma instalação bem-sucedida, a compilação temporária, node_modules,
o armazenamento privado de dependências e arquivos compilados duplicados são
removidos. Instalações com código-fonte personalizado preservam uma cópia para
atualizações futuras. Ferramentas verificadas são reutilizadas; cada arquivo do
cache é conferido antes da execução. Cópias de segurança, configurações
resgatadas, registros, arquivos baixados e cópias do código-fonte podem crescer
com atualizações. Compilações com falha ou apenas de validação ficam guardadas
para diagnóstico. Falhas na limpeza aparecem no registro. As cópias de
restauração contêm configurações e temas e devem ser tratadas como privadas.

ATUALIZAÇÕES E CONFIANÇA

A atualização automática do Vencord fica desativada nesta compilação para evitar
substituição por código não testado ou remoção do ReactionLibrary. Baixe um ZIP
mais recente na página Releases do projeto e execute-o para atualizar após
revisar as alterações. Execute ReactionLibrary-Setup.exe novamente para atualizar.
O botão Obter versão mais recente inicia o mesmo download. É necessária uma
versão pública no GitHub com o ZIP e seu arquivo SHA-256. Se o repositório for
privado ou não houver versão publicada, o iniciador para. Para uma instalação
sem internet, é possível executar Setup.ps1 diretamente do pacote extraído.

Cada execução verifica os hashes dos arquivos do pacote e dos downloads fixados,
ou reutiliza ferramentas do cache após verificá-las. As ferramentas são
portáteis: instalações do sistema de Node, Git e pnpm não são modificadas.
Dependências fixadas podem executar scripts normais da compilação. Use apenas
pacotes de fontes em que confia: hashes não comprovam a identidade de quem
publicou. Esta prévia NÃO É ASSINADA, a menos que seja distribuída com uma
assinatura verificável. O Windows pode avisar sobre os scripts. Políticas da
sua organização podem bloqueá-los; não contorne as restrições do administrador.

O iniciador confere os hashes SHA-256 fornecidos pelo GitHub, o arquivo SHA-256
da versão e os arquivos do ZIP. Isso detecta downloads alterados, mas não
comprova a identidade do publicador independentemente da conta do GitHub.
Uma versão sem assinatura exige confirmação separada antes de executar o instalador.
A instalação baixada sempre mostra uma revisão antes de alterar arquivos ativos.

Nenhum certificado vem incluído. Uma versão assinada pode fornecer um arquivo
.p7s e Verify-Release.ps1. Obtenha a impressão digital do certificado por outro
canal confiável e verifique antes de extrair ou executar:
  .\Verify-Release.ps1 -Zip .\ReactionLibrary-Windows-Setup.zip -ExpectedSignerThumbprint IMPRESSAO_DIGITAL

LIMITES DA VALIDAÇÃO

Testes automatizados verificam instalação, preservação, restauração, recusa de
arquivos alterados e recuperação de interrupções com dados simulados do Discord.
O plugin já foi compilado para o Vencord oficial. Ainda é preciso testar um ciclo
completo de instalação, atualização e restauração em uma máquina virtual Windows
com o Discord em execução antes de considerar a versão pronta para distribuição
ampla. Veja installer/RELEASING.md no projeto para assinatura e testes finais.
O registro técnico do instalador e as mensagens de ferramentas externas podem
aparecer em inglês, inclusive ao usar a interface em português.

Projeto: https://github.com/K0kai/reaction_library_plugin
GPL-3.0-or-later. Veja reactionLibrary/LICENSE e a licença MIT do gifenc incluída.
