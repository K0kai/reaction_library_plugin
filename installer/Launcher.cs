// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Launcher {
    [STAThread]
    private static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new LauncherForm());
    }
}

internal sealed class LauncherForm : Form {
    private readonly Label description = new Label();
    private readonly Label status = new Label();
    private readonly ComboBox language = new ComboBox();
    private readonly Button install = new Button();

    internal LauncherForm() {
        Text = "Reaction Library Setup";
        ClientSize = new Size(470, 210);
        MinimumSize = Size;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(35, 36, 40);
        ForeColor = Color.FromArgb(242, 243, 245);

        description.SetBounds(20, 18, 430, 66);
        description.AutoSize = false;
        Controls.Add(description);

        language.SetBounds(20, 92, 185, 30);
        language.DropDownStyle = ComboBoxStyle.DropDownList;
        language.Items.AddRange(new object[] { "English", "Português (Brasil)" });
        language.SelectedIndex = System.Globalization.CultureInfo.CurrentUICulture.Name.StartsWith("pt", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
        language.SelectedIndexChanged += (sender, args) => Localize();
        Controls.Add(language);

        install.SetBounds(220, 91, 230, 32);
        install.FlatStyle = FlatStyle.Flat;
        install.BackColor = Color.FromArgb(88, 101, 242);
        install.ForeColor = Color.White;
        install.Click += async (sender, args) => await InstallLatest();
        Controls.Add(install);

        status.SetBounds(20, 144, 430, 52);
        Controls.Add(status);
        Localize();
    }

    private bool Portuguese { get { return language.SelectedIndex == 1; } }

    private void Localize() {
        Text = Portuguese ? "Reaction Library - Instalador" : "Reaction Library Setup";
        description.Text = Portuguese
            ? "Baixa a versão mais recente do GitHub, verifica o pacote e abre a revisão da instalação. O Discord deve estar fechado ao instalar."
            : "Downloads the latest GitHub release, verifies the package, and opens the installation review. Close Discord before installing.";
        install.Text = Portuguese ? "Baixar e instalar" : "Download and install";
        if (install.Enabled) status.Text = Portuguese ? "Pronto para verificar a versão mais recente." : "Ready to check the latest release.";
    }

    private async Task InstallLatest() {
        install.Enabled = false;
        language.Enabled = false;
        status.Text = Portuguese ? "Verificando e baixando a versão mais recente..." : "Checking and downloading the latest release...";
        try {
            string source;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ReactionLibrary.Bootstrap.ps1")) {
                if (stream == null) throw new InvalidOperationException("The embedded updater is missing.");
                using (var reader = new StreamReader(stream, Encoding.UTF8)) source = reader.ReadToEnd();
            }
            var source64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(source));
            var launcherPath = Assembly.GetExecutingAssembly().Location.Replace("'", "''");
            var command = "$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + source64 + "')); & ([ScriptBlock]::Create($source)) -Language '" + (Portuguese ? "pt-BR" : "en") + "' -LauncherPath '" + launcherPath + "'";
            var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(command));
            var shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
            var info = new ProcessStartInfo(shell, "-NoProfile -ExecutionPolicy Bypass -STA -EncodedCommand " + encoded) {
                UseShellExecute = false,
                CreateNoWindow = true
            };
            var exitCode = await Task.Run(() => {
                using (var process = Process.Start(info)) {
                    if (process == null) throw new InvalidOperationException("PowerShell could not start.");
                    process.WaitForExit();
                    return process.ExitCode;
                }
            });
            if (exitCode == 0) Close();
            else status.Text = Portuguese ? "A atualização foi interrompida. Consulte a mensagem exibida." : "Update stopped. See the message shown.";
        } catch (Exception error) {
            MessageBox.Show(error.Message, Portuguese ? "Atualização interrompida" : "Update stopped", MessageBoxButtons.OK, MessageBoxIcon.Error);
            status.Text = Portuguese ? "A atualização foi interrompida." : "Update stopped.";
        } finally {
            if (!IsDisposed) {
                install.Enabled = true;
                language.Enabled = true;
            }
        }
    }
}
