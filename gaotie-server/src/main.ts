import { Neo4jService } from './neo4j.service';
import { Neo4jCaseService } from './neo4j-case.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';
import { loadDefaultEnvFiles } from './env';

async function bootstrap() {
  await loadDefaultEnvFiles();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ limit: '30mb', extended: true }));
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });
  app.useStaticAssets(join(__dirname, '..', '..', 'images'), {
    prefix: '/images/',
  });
  app.useStaticAssets(join(__dirname, '..', '..', '样本图片'), {
    prefix: '/sample-images/',
  });
  app.useStaticAssets(join(__dirname, '..', '..', '布局元素'), {
    prefix: '/layout-elements/',
  });
  app.useStaticAssets(join(process.cwd(), 'generated', 'super-canvas'), {
    prefix: '/generated/super-canvas/',
  });
  app.useStaticAssets(join(process.cwd(), 'generated', 'layout3d'), {
    prefix: '/generated/layout3d/',
  });
  app.useStaticAssets(join(process.cwd(), 'generated', 'final-proposals'), {
    prefix: '/generated/final-proposals/',
  });
  const [patterns, cases] = await Promise.all([app.get(Neo4jService).health(), app.get(Neo4jCaseService).health()]);
  console.log(`[启动预检] ${patterns.message}；${cases.message}`);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

function getCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS;

  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://8.210.235.216',
  ];
}
