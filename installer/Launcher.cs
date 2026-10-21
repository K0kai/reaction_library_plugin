// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
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
    private readonly ComboBox target = new ComboBox();
    private readonly TextBox source = new TextBox();
    private readonly TextBox log = new TextBox();
    private readonly Label targetLabel = new Label();
    private readonly Label sourceLabel = new Label();
    private readonly Button chooseTarget = new Button();
    private readonly Button chooseSource = new Button();
    private readonly Button review = new Button();
    private readonly Button restore = new Button();
    private readonly Timer timer = new Timer();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private readonly string basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReactionLibrarySetup");
    private string packagePath;
    private string updateWork;
    private string jobPath;
    private Process worker;
    private bool busy;

    internal LauncherForm() {
        Text = "Reaction Library Setup";
        ClientSize = new Size(820, 660);
        MinimumSize = Size;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(35, 36, 40);
        ForeColor = Color.FromArgb(242, 243, 245);

        description.SetBounds(20, 18, 780, 48);
        description.AutoSize = false;
        Controls.Add(description);

        language.SetBounds(20, 70, 185, 30);
        language.DropDownStyle = ComboBoxStyle.DropDownList;
        language.Items.AddRange(new object[] { "English", "Português (Brasil)" });
        language.SelectedIndex = System.Globalization.CultureInfo.CurrentUICulture.Name.StartsWith("pt", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
        language.SelectedIndexChanged += (sender, args) => Localize();
        Controls.Add(language);

        install.SetBounds(220, 69, 230, 32);
        install.FlatStyle = FlatStyle.Flat;
        install.BackColor = Color.FromArgb(88, 101, 242);
        install.ForeColor = Color.White;
        install.Click += async (sender, args) => await InstallLatest();
        Controls.Add(install);

        targetLabel.SetBounds(20, 122, 780, 22);
        Controls.Add(targetLabel);
        target.SetBounds(20, 147, 635, 28);
        Controls.Add(target);
        chooseTarget.SetBounds(665, 145, 135, 30);
        chooseTarget.Click += (sender, args) => ChooseFolder(value => target.Text = value);
        Controls.Add(chooseTarget);
        sourceLabel.SetBounds(20, 190, 780, 22);
        Controls.Add(sourceLabel);
        source.SetBounds(20, 215, 635, 28);
        Controls.Add(source);
        chooseSource.SetBounds(665, 213, 135, 30);
        chooseSource.Click += (sender, args) => ChooseFolder(value => source.Text = value);
        Controls.Add(chooseSource);
        review.SetBounds(20, 260, 175, 34);
        review.Click += async (sender, args) => await ReviewAndInstall();
        Controls.Add(review);
        restore.SetBounds(205, 260, 245, 34);
        restore.Click += async (sender, args) => await RestorePrevious();
        Controls.Add(restore);
        status.SetBounds(20, 309, 780, 42);
        Controls.Add(status);
        log.SetBounds(20, 356, 780, 282);
        log.Multiline = true;
        log.ReadOnly = true;
        log.ScrollBars = ScrollBars.Vertical;
        log.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        log.BackColor = Color.FromArgb(26, 27, 30);
        log.ForeColor = ForeColor;
        Controls.Add(log);
        timer.Interval = 500;
        timer.Tick += (sender, args) => RefreshLog();
        FormClosing += OnClosing;
        ShowSetup(false);
        Localize();
    }

    private bool Portuguese { get { return language.SelectedIndex == 1; } }
    private string LanguageCode { get { return Portuguese ? "pt-BR" : "en"; } }
    private string L(string english, string portuguese) { return Portuguese ? portuguese : english; }

    private void Localize() {
        Text = L("Reaction Library Setup", "Reaction Library - Instalador");
        description.Text = L("Download and verify the latest release, then review installation in this window.\r\nExisting Vencord is required. Close Discord before installing.", "Baixe e verifique a versão mais recente, depois revise a instalação nesta janela.\r\nO Vencord deve estar instalado. Feche o Discord antes de instalar.");
        install.Text = L("Download setup", "Baixar instalador");
        targetLabel.Text = L("Discord resources folder:", "Pasta de recursos do Discord:");
        sourceLabel.Text = L("Vencord source folder (if needed for custom plugins):", "Pasta do código-fonte do Vencord (se necessária para plugins personalizados):");
        chooseTarget.Text = chooseSource.Text = L("Choose folder", "Escolher pasta");
        review.Text = L("Review / Install", "Revisar / Instalar");
        restore.Text = L("Restore previous installation", "Restaurar instalação anterior");
        if (!busy) status.Text = packagePath == null ? L("Ready to download the latest release.", "Pronto para baixar a versão mais recente.") : L("Ready to review installation or restore.", "Pronto para revisar a instalação ou restaurar.");
    }

    private void ShowSetup(bool visible) {
        foreach (Control control in new Control[] { targetLabel, target, chooseTarget, sourceLabel, source, chooseSource, review, restore, log }) control.Visible = visible;
    }
    private void ChooseFolder(Action<string> selected) {
        using (var picker = new FolderBrowserDialog()) if (picker.ShowDialog(this) == DialogResult.OK) selected(picker.SelectedPath);
    }
    private void SetBusy(bool value) {
        busy = value;
        install.Enabled = !value && packagePath == null;
        language.Enabled = !value;
        foreach (Control control in new Control[] { target, chooseTarget, source, chooseSource, review, restore }) control.Enabled = !value;
    }
    private static string Quote(string value) { return "\"" + value + "\""; }
    private string Shell { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"); } }
    private static Process StartHidden(string program, string arguments) {
        var info = new ProcessStartInfo(program, arguments) { UseShellExecute = false, CreateNoWindow = true };
        var process = Process.Start(info);
        if (process == null) throw new InvalidOperationException("The setup worker could not start.");
        return process;
    }
    private async Task<int> RunHidden(string script, string arguments) {
        return await Task.Run(() => {
            using (var process = StartHidden(Shell, "-NoProfile -ExecutionPolicy Bypass -STA -File " + Quote(script) + " " + arguments)) {
                process.WaitForExit();
                return process.ExitCode;
            }
        });
    }
    private Dictionary<string, object> ReadResponse(string file) {
        if (!File.Exists(file)) throw new InvalidOperationException("The setup worker did not return a result.");
        var result = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file, Encoding.UTF8));
        if (result.ContainsKey("error")) throw new InvalidOperationException(Convert.ToString(result["error"]));
        return result;
    }

    private async Task InstallLatest() {
        SetBusy(true);
        status.Text = L("Downloading and verifying the latest GitHub release...", "Baixando e verificando a versão mais recente do GitHub...");
        string bootstrapPath = null;
        try {
            string source;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ReactionLibrary.Bootstrap.ps1")) {
                if (stream == null) throw new InvalidOperationException("The embedded updater is missing.");
                using (var reader = new StreamReader(stream, Encoding.UTF8)) source = reader.ReadToEnd();
            }
            var work = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReactionLibrarySetup", "launcher");
            Directory.CreateDirectory(work);
            bootstrapPath = Path.Combine(work, "bootstrap-" + Guid.NewGuid().ToString("N") + ".ps1");
            var resultFile = Path.Combine(work, "result-" + Guid.NewGuid().ToString("N") + ".json");
            try {
                using (var file = new FileStream(bootstrapPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                using (var writer = new StreamWriter(file, new UTF8Encoding(true))) writer.Write(source);
                var args = "-Language " + LanguageCode + " -LauncherPath " + Quote(Assembly.GetExecutingAssembly().Location) + " -DownloadOnly -ResultPath " + Quote(resultFile);
                var exitCode = await RunHidden(bootstrapPath, args);
                var result = ReadResponse(resultFile);
                if (exitCode != 0) throw new InvalidOperationException("Download verification stopped.");
                packagePath = Convert.ToString(result["package"]);
                updateWork = Convert.ToString(result["work"]);
                var publisher = Convert.ToString(result["publisher"]);
                if (publisher != "trusted") {
                    var warning = publisher == "signed-unpinned"
                        ? L("Windows verified publisher: ", "Publicador verificado pelo Windows: ") + Convert.ToString(result["subject"]) + "\r\n" + L("Trust this publisher and continue?", "Confiar neste publicador e continuar?")
                        : L("This release has no publisher signature. GitHub and package hashes match, but they do not independently prove the author. Continue?", "Esta versão não tem assinatura de publicador. Os hashes do GitHub e do pacote conferem, mas não comprovam a identidade do autor separadamente. Continuar?");
                    if (MessageBox.Show(this, warning, L("Confirm publisher", "Confirmar publicador"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) {
                        CleanupUpdate(updateWork);
                        updateWork = null;
                        packagePath = null;
                        return;
                    }
                }
                var detected = await Inspect("detect", null, null);
                var targets = detected["targets"] as object[];
                target.Items.Clear();
                if (targets != null) foreach (var item in targets) target.Items.Add(Convert.ToString(item));
                if (target.Items.Count > 0) target.SelectedIndex = 0;
                ShowSetup(true);
                status.Text = L("Verified release " + Convert.ToString(result["tag"]) + ". Review the detected installation.", "Versão " + Convert.ToString(result["tag"]) + " verificada. Revise a instalação detectada.");
            } finally { if (File.Exists(resultFile)) File.Delete(resultFile); }
        } catch (Exception error) {
            if (updateWork != null) { try { CleanupUpdate(updateWork); } catch { } updateWork = null; }
            packagePath = null;
            MessageBox.Show(this, error.Message, L("Setup stopped", "Instalação interrompida"), MessageBoxButtons.OK, MessageBoxIcon.Error);
            status.Text = L("Setup stopped.", "Instalação interrompida.");
        } finally {
            if (bootstrapPath != null && File.Exists(bootstrapPath)) File.Delete(bootstrapPath);
            SetBusy(false);
        }
    }
    private async Task<Dictionary<string, object>> Inspect(string action, string resources, string selectedSource) {
        var job = Path.Combine(basePath, "logs", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(job);
        File.WriteAllText(Path.Combine(job, "request.json"), json.Serialize(new { action = action, resources = resources, source = selectedSource }), new UTF8Encoding(false));
        var exitCode = await RunHidden(Path.Combine(packagePath, "Setup.ps1"), "-Inspect -JobDirectory " + Quote(job) + " -Language " + LanguageCode);
        var result = ReadResponse(Path.Combine(job, "response.json"));
        if (exitCode != 0) throw new InvalidOperationException("Setup inspection stopped.");
        return result;
    }
    private async Task ReviewAndInstall() {
        SetBusy(true);
        try {
            var result = await Inspect("plan", target.Text, source.Text);
            var summary = Convert.ToString(result["summary"]);
            if (MessageBox.Show(this, summary + "\r\n\r\n" + L("Build and install this version?", "Compilar e instalar esta versão?"), L("Review changes", "Revisar alterações"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            await StartWorker(new { action = "install", resources = target.Text, source = source.Text, summary = summary, language = LanguageCode });
        } catch (Exception error) { MessageBox.Show(this, error.Message, L("Setup stopped", "Instalação interrompida"), MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { SetBusy(false); }
    }
    private async Task RestorePrevious() {
        SetBusy(true);
        try {
            var result = await Inspect("restore", null, null);
            var message = L("Restore the saved build, settings, and themes from ", "Restaurar a compilação, as configurações e os temas salvos em ") + Convert.ToString(result["created"]) + "?\r\n" + L("Target: ", "Destino: ") + Convert.ToString(result["target"]);
            if (MessageBox.Show(this, message, L("Restore previous installation", "Restaurar instalação anterior"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            await StartWorker(new { action = "restore", backup = Convert.ToString(result["backup"]), language = LanguageCode });
        } catch (Exception error) { MessageBox.Show(this, error.Message, L("Restore stopped", "Restauração interrompida"), MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { SetBusy(false); }
    }
    private async Task StartWorker(object request) {
        jobPath = Path.Combine(basePath, "logs", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(jobPath);
        File.WriteAllText(Path.Combine(jobPath, "request.json"), json.Serialize(request), new UTF8Encoding(false));
        log.Clear();
        status.Text = L("Working. Keep this window open and Discord closed.", "Em andamento. Mantenha esta janela aberta e o Discord fechado.");
        var args = "-NoProfile -ExecutionPolicy Bypass -STA -File " + Quote(Path.Combine(packagePath, "Setup.ps1")) + " -Worker -JobDirectory " + Quote(jobPath) + " -Language " + LanguageCode;
        worker = StartHidden(Shell, args);
        timer.Start();
        try {
            var exitCode = await Task.Run(() => { worker.WaitForExit(); return worker.ExitCode; });
            RefreshLog();
            status.Text = exitCode == 0 ? L("Finished. Restart Discord.", "Concluído. Reinicie o Discord.") : L("Stopped. See the log. Restore is available if files were switched.", "Interrompido. Consulte o registro. A restauração está disponível se os arquivos foram trocados.");
        } finally {
            timer.Stop();
            worker.Dispose();
            worker = null;
        }
    }
    private void RefreshLog() {
        if (jobPath == null) return;
        var file = Path.Combine(jobPath, "progress.log");
        if (!File.Exists(file)) return;
        try {
            var content = File.ReadAllText(file);
            if (log.Text != content) { log.Text = content; log.SelectionStart = log.TextLength; log.ScrollToCaret(); }
        } catch (IOException) { }
    }
    private void OnClosing(object sender, FormClosingEventArgs args) {
        if (busy) { args.Cancel = true; MessageBox.Show(this, L("Setup is still running. Keep this window open.", "A instalação ainda está em andamento. Mantenha esta janela aberta.")); return; }
        if (updateWork != null) {
            try { CleanupUpdate(updateWork); } catch { }
        }
        timer.Dispose();
    }
    private void CleanupUpdate(string path) {
        var root = Path.GetFullPath(Path.Combine(basePath, "updates")).TrimEnd('\\') + "\\";
        var full = Path.GetFullPath(path);
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || Path.GetDirectoryName(full).TrimEnd('\\') != root.TrimEnd('\\')) return;
        Guid ignored;
        if (!Guid.TryParseExact(Path.GetFileName(full), "N", out ignored)) return;
        var directory = new DirectoryInfo(full);
        if (!directory.Exists || (directory.Attributes & FileAttributes.ReparsePoint) != 0) return;
        DeleteNoFollow(directory);
    }
    private static void DeleteNoFollow(FileSystemInfo entry) {
        if ((entry.Attributes & FileAttributes.ReparsePoint) != 0) { entry.Delete(); return; }
        var directory = entry as DirectoryInfo;
        if (directory != null) foreach (var child in directory.GetFileSystemInfos()) DeleteNoFollow(child);
        if ((entry.Attributes & FileAttributes.ReadOnly) != 0) entry.Attributes &= ~FileAttributes.ReadOnly;
        entry.Delete();
    }
}
