using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// A loopback-only static server. All responses come from embedded build assets;
// no request can read from the filesystem or mutate application data.
internal static class Launcher
{
    private const int Port = 4175;
    private const string Address = "http://127.0.0.1:4175/catan-stats-web/";
    private static readonly Dictionary<string, byte[]> Assets = new Dictionary<string, byte[]>(StringComparer.Ordinal);
    private static TcpListener server;
    private static volatile bool stopping;
    private static bool quiet;

    [STAThread]
    private static int Main(string[] args)
    {
        quiet = Array.IndexOf(args, "--no-browser") >= 0;
        Application.EnableVisualStyles();
        bool first;
        using (var instance = new Mutex(true, "Local\\CatanStatsWebLauncher4175", out first))
        {
            if (!first) { if (!quiet) OpenBrowser(); return 0; }
            try
            {
                using (var archive = new ZipArchive(Assembly.GetExecutingAssembly().GetManifestResourceStream("site.zip"), ZipArchiveMode.Read))
                {
                    foreach (var entry in archive.Entries)
                    {
                        if (entry.Name.Length == 0) continue;
                        using (var input = entry.Open())
                        using (var output = new MemoryStream())
                        {
                            input.CopyTo(output);
                            Assets.Add("/catan-stats-web/" + entry.FullName.Replace('\\', '/'), output.ToArray());
                        }
                    }
                }
                if (!Assets.ContainsKey("/catan-stats-web/index.html")) throw new Exception("The embedded app is missing. Rebuild the launcher.");
                server = new TcpListener(IPAddress.Loopback, Port);
                server.Server.ExclusiveAddressUse = true;
                server.Start(32);
                var thread = new Thread(Serve) { IsBackground = true };
                thread.Start();
                using (var tray = new NotifyIcon())
                using (var menu = new ContextMenuStrip())
                {
                    menu.Items.Add("Open Catan Stats", null, delegate { OpenBrowser(); });
                    menu.Items.Add("Exit / stop server", null, delegate { Application.Exit(); });
                    tray.Icon = SystemIcons.Application;
                    tray.Text = "Catan Stats - local server";
                    tray.ContextMenuStrip = menu;
                    tray.DoubleClick += delegate { OpenBrowser(); };
                    tray.Visible = true;
                    if (!quiet) OpenBrowser();
                    Application.Run();
                    tray.Visible = false;
                }
                return 0;
            }
            catch (Exception error)
            {
                if (!quiet) MessageBox.Show("Catan Stats could not start.\n\n" + error.Message + "\n\nIf port 4175 is in use, close the other server and try again.", "Catan Stats", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally { stopping = true; if (server != null) server.Stop(); instance.ReleaseMutex(); }
        }
    }

    private static void OpenBrowser()
    {
        try { Process.Start(new ProcessStartInfo(Address) { UseShellExecute = true }); }
        catch { MessageBox.Show("Open this address in your browser:\n" + Address, "Catan Stats"); }
    }

    private static void Serve()
    {
        while (!stopping)
        {
            try { var client = server.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(delegate { Respond(client); }); }
            catch (SocketException) { if (stopping) return; }
            catch (ObjectDisposedException) { return; }
        }
    }

    private static void Respond(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 3000;
                client.SendTimeout = 3000;
                using (var stream = client.GetStream())
                {
                    var header = new StringBuilder();
                    while (header.Length < 16384)
                    {
                        int value = stream.ReadByte();
                        if (value < 0) return;
                        header.Append((char)value);
                        int n = header.Length;
                        if (n >= 4 && header[n - 4] == '\r' && header[n - 3] == '\n' && header[n - 2] == '\r' && header[n - 1] == '\n') break;
                    }
                    var lines = header.ToString().Split(new[] { "\r\n" }, StringSplitOptions.None);
                    var request = lines[0].Split(' ');
                    if (header.Length >= 16384 || request.Length != 3) { Reply(stream, "400 Bad Request", "text/plain", new byte[0], false); return; }
                    bool validHost = false;
                    foreach (var line in lines) if (line.Equals("Host: 127.0.0.1:" + Port, StringComparison.OrdinalIgnoreCase)) validHost = true;
                    if (!validHost) { Reply(stream, "403 Forbidden", "text/plain", new byte[0], false); return; }
                    bool head = request[0] == "HEAD";
                    if (request[0] != "GET" && !head) { Reply(stream, "405 Method Not Allowed", "text/plain", new byte[0], false); return; }
                    string path = request[1].Split('?')[0];
                    if (path == "/catan-stats-web/") path += "index.html";
                    byte[] body;
                    if (!Assets.TryGetValue(path, out body)) { Reply(stream, "404 Not Found", "text/plain", Encoding.UTF8.GetBytes("Not found"), head); return; }
                    string extension = Path.GetExtension(path);
                    string mime = extension == ".html" ? "text/html; charset=utf-8" : extension == ".js" ? "text/javascript; charset=utf-8" : extension == ".css" ? "text/css; charset=utf-8" : extension == ".svg" ? "image/svg+xml" : extension == ".png" ? "image/png" : "application/octet-stream";
                    Reply(stream, "200 OK", mime, body, head);
                }
            }
            catch (IOException) { }
            catch (SocketException) { }
        }
    }

    private static void Reply(Stream stream, string status, string mime, byte[] body, bool head)
    {
        byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + "\r\nContent-Type: " + mime + "\r\nContent-Length: " + body.Length + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n");
        stream.Write(header, 0, header.Length);
        if (!head) stream.Write(body, 0, body.Length);
    }
}
