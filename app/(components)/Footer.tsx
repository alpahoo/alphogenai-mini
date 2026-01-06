export default function Footer() {
  const currentYear = new Date().getFullYear();
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center space-y-4">
          {/* Copyright */}
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            © {currentYear} AlphoGenAI Mini — Texte → Vidéo cohérente en 90s.
          </p>

          {/* Links */}
          <div className="flex items-center justify-center gap-6 text-xs">
            <a
              href="#"
              className="text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Mentions légales
            </a>

            {contactEmail && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  Contact
                </a>
              </>
            )}

            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a
              href="/generate"
              className="text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Créer une vidéo
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
