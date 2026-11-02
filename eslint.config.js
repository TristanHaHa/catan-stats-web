import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores: ['dist/**','**/node_modules/**','functions/lib/**','playwright-report/**','test-results/**'] }, js.configs.recommended, ...ts.configs.recommended, { files: ['**/*.{ts,tsx,js}'], languageOptions: { globals: { window:'readonly', document:'readonly', crypto:'readonly', localStorage:'readonly', StorageEvent:'readonly', HTMLDialogElement:'readonly', HTMLElement:'readonly', console:'readonly' } } });
