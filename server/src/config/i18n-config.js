import i18n from 'i18n';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read locale configuration from root package.json
let packageJson;
try {
  packageJson = JSON.parse(
    readFileSync(path.join(__dirname, '../../../package.json'), 'utf8')
  );
} catch (error) {
  console.warn('Could not read package.json, using default locale settings');
  packageJson = {
    config: {
      locale: 'en',
      supportedLocales: ['en', 'zh']
    }
  };
}

// Configure i18n
i18n.configure({
  locales: packageJson.config?.supportedLocales || ['en', 'zh'],
  defaultLocale: packageJson.config?.locale || 'en',
  directory: path.join(__dirname, '../../locales'),
  objectNotation: true,
  updateFiles: false,
  syncFiles: false,
  register: global
});

// Set the locale from configuration
i18n.setLocale(packageJson.config?.locale || 'en');

export default i18n;
