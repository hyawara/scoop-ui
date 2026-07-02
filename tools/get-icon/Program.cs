using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

class IconExtractor {
    static int Main(string[] args) {
        if (args.Length == 0) {
            Console.Error.WriteLine("Usage: get-icon.exe <path-to-exe-or-dll>");
            return 1;
        }

        string filePath = args[0];

        if (!File.Exists(filePath)) {
            Console.Error.WriteLine($"File not found: {filePath}");
            return 1;
        }

        try {
            using (Icon? icon = Icon.ExtractAssociatedIcon(filePath)) {
                if (icon == null) {
                    Console.Error.WriteLine($"No icon found in: {filePath}");
                    return 1;
                }

                using (Bitmap bitmap = icon.ToBitmap())
                using (MemoryStream ms = new MemoryStream()) {
                    bitmap.Save(ms, ImageFormat.Png);
                    Console.Write(Convert.ToBase64String(ms.ToArray()));
                    return 0;
                }
            }
        } catch (Exception ex) {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }
}
