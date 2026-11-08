"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const testing_1 = require("@nestjs/testing");
const supertest_1 = tslib_1.__importDefault(require("supertest"));
const app_module_js_1 = require("./../src/app.module.js");
describe('AppController (e2e)', () => {
    let app;
    beforeEach(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_js_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    it('/ (GET)', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/')
            .expect(200)
            .expect('Hello World!');
    });
    afterEach(async () => {
        await app.close();
    });
});
//# sourceMappingURL=app.e2e-spec.js.map