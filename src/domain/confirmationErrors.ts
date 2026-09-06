const stripFileName = (message: string) => message.replace(/^[^:]+:\s*/, "");

export function formatDownloadStartError(raw: string): string {
  const message = stripFileName(raw);
  if (/já está em andamento ou pausado/i.test(message)) {
    return "Não foi possível iniciar o download porque já existe outra instância deste arquivo ativa ou pausada.";
  }
  if (/já foi baixado/i.test(message)) {
    return "Não foi possível iniciar o download porque este arquivo já foi baixado anteriormente.";
  }
  if (/HTTP (401|403)|não autorizado|acesso negado/i.test(message)) {
    return "O servidor recusou o acesso. Faça login novamente no site e tente iniciar o download pelo navegador.";
  }
  if (/HTTP 404|não encontrado/i.test(message)) {
    return "O arquivo não foi encontrado no servidor. Confirme se o link ainda é válido e gere um novo link, se necessário.";
  }
  if (/tempo limite|timeout|falha ao conectar|network/i.test(message)) {
    return "Não foi possível conectar ao servidor agora. Verifique sua conexão e tente novamente em alguns instantes.";
  }
  if (/espaço em disco/i.test(message)) {
    return "Não há espaço suficiente no destino. Libere espaço ou escolha outra pasta antes de tentar novamente.";
  }
  if (/permissão|permission/i.test(message)) {
    return "O aplicativo não tem permissão para gravar nessa pasta. Escolha outro destino ou ajuste as permissões.";
  }
  if (!message) {
    return "Ocorreu um erro inesperado ao tentar iniciar o download.";
  }
  return message.charAt(0).toUpperCase() + message.slice(1);
}
