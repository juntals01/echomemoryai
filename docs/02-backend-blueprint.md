> Part of [FriendAI Architecture Documentation](./README.md)

# FriendAI Backend — Implementation Blueprint

Complete code generation plan for the FriendAI NestJS backend API.

**Stack:** NestJS · PostgreSQL · pgvector · MinIO · Redis + BullMQ · DeepSeek / Gemini

**Goal:** Build the backend for a mobile AI companion that remembers user information using RAG.

---

## Table of Contents

1. [Project Root Files](#1-project-root-files)
2. [Environment Variables](#2-environment-variables)
3. [Application Bootstrap](#3-application-bootstrap)
4. [Configuration Module](#4-configuration-module)
5. [Database Setup](#5-database-setup)
6. [Common Utilities](#6-common-utilities)
7. [Auth Module](#7-auth-module)
8. [Users Module](#8-users-module)
9. [Conversations Module](#9-conversations-module)
10. [Messages Module](#10-messages-module)
11. [Chat Module](#11-chat-module)
12. [AI Module](#12-ai-module)
13. [Memories Module](#13-memories-module)
14. [Retrieval Module](#14-retrieval-module)
15. [Facts Module](#15-facts-module)
16. [People Module](#16-people-module)
17. [Ingestion Module](#17-ingestion-module)
18. [Content Processing Module](#18-content-processing-module)
19. [Files Module](#19-files-module)
20. [Storage Module](#20-storage-module)
21. [Jobs Module](#21-jobs-module)
22. [Health Module](#22-health-module)
23. [Full Folder Tree](#23-full-folder-tree)

---

## 1. Project Root Files

### `api/package.json`

```json
{
  "name": "friendai-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli",
    "migration:generate": "npm run typeorm -- migration:generate",
    "migration:run": "npm run typeorm -- migration:run",
    "migration:revert": "npm run typeorm -- migration:revert"
  },
  "dependencies": {
    "@nestjs/bullmq": "^11.0.0",
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "bcrypt": "^5.0.0",
    "bullmq": "^5.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "minio": "^8.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.0",
    "pg": "^8.0.0",
    "pgvector": "^0.2.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.0.0",
    "typeorm": "^0.3.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@types/bcrypt": "^5.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/passport-jwt": "^4.0.0",
    "@types/uuid": "^10.0.0",
    "ts-loader": "^9.0.0",
    "ts-node": "^10.0.0",
    "tsconfig-paths": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

### `api/tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `api/tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

### `api/nest-cli.json`

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

---

## 2. Environment Variables

### `api/.env.example`

```env
# Database (PostgreSQL + pgvector)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=echomemory
DATABASE_PASSWORD=echomemory
DATABASE_NAME=echomemory

# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=change-this-to-a-random-secret
JWT_EXPIRES_IN=7d

# MinIO (Object Storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET=friendai

# AI Provider: 'deepseek' | 'gemini'
AI_PROVIDER=deepseek
AI_API_KEY=your-api-key-here
AI_MODEL=deepseek-chat
AI_EMBEDDING_MODEL=text-embedding-3-small

# App
PORT=3000
NODE_ENV=development
```

**Rule:** Copy to `api/.env` and fill in real values. Never commit `.env`.

---

## 3. Application Bootstrap

### `src/main.ts`

Entry point. Creates the NestJS app, configures global pipes, prefix, CORS, and starts listening.

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}

bootstrap();
```

### `src/app.module.ts`

Root module. Imports all feature modules, configures TypeORM and BullMQ globally.

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { ChatModule } from './chat/chat.module';
import { MemoriesModule } from './memories/memories.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { FactsModule } from './facts/facts.module';
import { PeopleModule } from './people/people.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ContentProcessingModule } from './content-processing/content-processing.module';
import { FilesModule } from './files/files.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Global config from .env
    ConfigModule.forRoot({ isGlobal: true }),

    // PostgreSQL + TypeORM (entities auto-loaded)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USERNAME', 'echomemory'),
        password: config.get('DATABASE_PASSWORD', 'echomemory'),
        database: config.get('DATABASE_NAME', 'echomemory'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
      }),
    }),

    // Redis + BullMQ (global connection for all queues)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
    ChatModule,
    MemoriesModule,
    RetrievalModule,
    FactsModule,
    PeopleModule,
    IngestionModule,
    ContentProcessingModule,
    FilesModule,
    StorageModule,
    AiModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  // Enable pgvector extension on startup
  async onModuleInit() {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
  }
}
```

---

## 4. Configuration Module

NestJS `ConfigModule` with `isGlobal: true` is configured in `AppModule` above. No separate config module file needed — `ConfigService` is available everywhere via DI.

### `src/config/database.config.ts`

Standalone TypeORM data source for CLI migrations (not used at runtime).

```typescript
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'echomemory',
  password: process.env.DATABASE_PASSWORD || 'echomemory',
  database: process.env.DATABASE_NAME || 'echomemory',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
```

### `src/database/migrations/.gitkeep`

Empty directory. Migrations will be generated here by TypeORM CLI.

---

## 5. Database Setup

All entities live inside their respective module under `entities/`. TypeORM auto-loads them via `autoLoadEntities: true`.

### Entity Relationship Summary

```
User
 ├── has many Conversation
 ├── has many MemoryItem
 ├── has many UserFact
 ├── has many Person
 ├── has many FileObject
 └── has many IngestedItem

Conversation
 └── has many Message

MemoryItem
 └── has many MemoryChunk (with vector embedding)

IngestedItem
 └── belongs to FileObject (optional)
```

### pgvector Column Setup

The `MemoryChunk` entity stores a `vector(1536)` column. Since TypeORM has no native vector type, we define it as a raw column:

```typescript
@Column({ type: 'float', array: true, nullable: true })
embedding: number[] | null;
```

At runtime, we use raw SQL queries with the `<=>` operator for cosine similarity search. The `AppModule.onModuleInit()` runs `CREATE EXTENSION IF NOT EXISTS vector` to ensure pgvector is available.

**Alternative approach (raw column):** Store as `text` and use `::vector` cast in queries. The float array approach is simpler for TypeORM compatibility.

For production, a raw `@Column('vector')` with a custom TypeORM column type via `pgvector/typeorm` is preferred. Both approaches are documented in the entity file.

---

## 6. Common Utilities

### `src/common/decorators/current-user.decorator.ts`

Extracts the authenticated user from the request object. Used in controllers.

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

### `src/common/guards/jwt-auth.guard.ts`

Standard Passport JWT guard. Apply to protected routes.

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### `src/common/filters/http-exception.filter.ts`

Global exception filter. Normalizes error responses.

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### `src/common/interceptors/transform.interceptor.ts`

Wraps all successful responses in a consistent envelope.

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

### `src/common/dto/pagination.dto.ts`

Reusable pagination query parameters.

```typescript
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
```

### `src/common/utils/chunk.util.ts`

Text chunking utility for memory processing.

```typescript
export interface ChunkOptions {
  maxTokens: number;   // rough token limit per chunk
  overlap: number;     // overlap tokens between chunks
}

/**
 * Splits text into overlapping chunks.
 * Uses word-based splitting as a rough token approximation (1 word ≈ 1.3 tokens).
 */
export function chunkText(
  text: string,
  options: ChunkOptions = { maxTokens: 500, overlap: 50 },
): string[] {
  const words = text.split(/\s+/);
  const wordsPerChunk = Math.floor(options.maxTokens / 1.3);
  const overlapWords = Math.floor(options.overlap / 1.3);
  const chunks: string[] = [];

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start = end - overlapWords;
    if (start >= words.length) break;
  }

  return chunks;
}
```

### `src/common/types/index.ts`

Shared type definitions used across modules.

```typescript
export interface RetrievalContext {
  recentMessages: Array<{ role: string; content: string }>;
  memories: Array<{ content: string; similarity: number; title: string }>;
  facts: Array<{ category: string; subject: string; value: string }>;
  people: Array<{ name: string; relationship: string; notes: string }>;
}

export interface ChatContext {
  systemPrompt: string;
  retrievalContext: RetrievalContext;
  conversationHistory: Array<{ role: string; content: string }>;
  userMessage: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface FactExtractionResult {
  category: string;
  subject: string;
  predicate: string;
  value: string;
  confidence: number;
}

export interface MemoryClassification {
  containsFact: boolean;
  containsGoal: boolean;
  containsPreference: boolean;
  containsEvent: boolean;
  containsRelationship: boolean;
  containsEmotion: boolean;
  isMemorable: boolean;
  importance: number;
}
```

---

## 7. Auth Module

JWT-based authentication. Hashes passwords with bcrypt. Issues JWT tokens on login.

### Files

```
src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── strategies/
│   └── jwt.strategy.ts
└── dto/
    ├── register.dto.ts
    └── login.dto.ts
```

### `src/auth/dto/register.dto.ts`

```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName: string;
}
```

### `src/auth/dto/login.dto.ts`

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

### `src/auth/strategies/jwt.strategy.ts`

Passport strategy that validates JWT tokens and attaches user to request.

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', 'default-secret'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
```

### `src/auth/auth.service.ts`

Handles registration (hash + create user), login (verify + issue JWT).

```typescript
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    });

    const token = this.generateToken(user.id, user.email);
    return { accessToken: token, user: this.sanitizeUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.generateToken(user.id, user.email);
    return { accessToken: token, user: this.sanitizeUser(user) };
  }

  private generateToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
```

### `src/auth/auth.controller.ts`

Three endpoints: register, login, me.

```typescript
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
```

### `src/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'default-secret'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

---

## 8. Users Module

### Files

```
src/users/
├── users.module.ts
├── users.service.ts
└── entities/
    └── user.entity.ts
```

### `src/users/entities/user.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { MemoryItem } from '../../memories/entities/memory-item.entity';
import { UserFact } from '../../facts/entities/user-fact.entity';
import { Person } from '../../people/entities/person.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  displayName: string;

  @Column({ nullable: true })
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Conversation, (c) => c.user)
  conversations: Conversation[];

  @OneToMany(() => MemoryItem, (m) => m.user)
  memories: MemoryItem[];

  @OneToMany(() => UserFact, (f) => f.user)
  facts: UserFact[];

  @OneToMany(() => Person, (p) => p.user)
  people: Person[];
}
```

### `src/users/users.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async create(data: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }
}
```

### `src/users/users.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

---

## 9. Conversations Module

### Files

```
src/conversations/
├── conversations.module.ts
├── conversations.controller.ts
├── conversations.service.ts
├── entities/
│   └── conversation.entity.ts
└── dto/
    └── create-conversation.dto.ts
```

### `src/conversations/entities/conversation.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Message } from '../../messages/entities/message.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ default: 0 })
  messageCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Message, (m) => m.conversation)
  messages: Message[];
}
```

### `src/conversations/dto/create-conversation.dto.ts`

```typescript
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
```

### `src/conversations/conversations.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private conversationsRepo: Repository<Conversation>,
  ) {}

  async create(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    const conversation = this.conversationsRepo.create({
      userId,
      title: dto.title || 'New Conversation',
    });
    return this.conversationsRepo.save(conversation);
  }

  async findAllByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Conversation[]; total: number }> {
    const [data, total] = await this.conversationsRepo.findAndCount({
      where: { userId },
      order: { lastMessageAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findById(id: string, userId: string): Promise<Conversation> {
    const conversation = await this.conversationsRepo.findOne({
      where: { id, userId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async incrementMessageCount(id: string): Promise<void> {
    await this.conversationsRepo.update(id, {
      messageCount: () => '"messageCount" + 1',
      lastMessageAt: new Date(),
    });
  }

  async updateSummary(id: string, summary: string): Promise<void> {
    await this.conversationsRepo.update(id, { summary });
  }
}
```

### `src/conversations/conversations.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { MessagesService } from '../messages/messages.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
  ) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() pagination: PaginationDto) {
    return this.conversationsService.findAllByUser(
      user.id,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.conversationsService.findById(id, user.id);
  }

  @Get(':id/messages')
  getMessages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.messagesService.findByConversation(
      id,
      user.id,
      pagination.page,
      pagination.limit,
    );
  }
}
```

### `src/conversations/conversations.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation]), MessagesModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
```

---

## 10. Messages Module

### Files

```
src/messages/
├── messages.module.ts
├── messages.service.ts
└── entities/
    └── message.entity.ts
```

### `src/messages/entities/message.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: MessageRole })
  role: MessageRole;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  tokenCount: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
```

### `src/messages/messages.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageRole } from './entities/message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepo: Repository<Message>,
  ) {}

  async create(data: {
    conversationId: string;
    userId: string;
    role: MessageRole;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<Message> {
    const message = this.messagesRepo.create(data);
    return this.messagesRepo.save(message);
  }

  async findByConversation(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: Message[]; total: number }> {
    const [data, total] = await this.messagesRepo.findAndCount({
      where: { conversationId, userId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /** Load the most recent N messages for context assembly. */
  async getRecentMessages(
    conversationId: string,
    limit = 20,
  ): Promise<Message[]> {
    return this.messagesRepo.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findById(id: string): Promise<Message | null> {
    return this.messagesRepo.findOne({ where: { id } });
  }
}
```

### `src/messages/messages.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { MessagesService } from './messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message])],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
```

---

## 11. Chat Module

The core orchestration module. Receives a user message, runs retrieval, calls the AI, saves the response, and enqueues background memory processing.

### Files

```
src/chat/
├── chat.module.ts
├── chat.controller.ts
├── chat.service.ts
└── dto/
    └── send-message.dto.ts
```

### `src/chat/dto/send-message.dto.ts`

```typescript
import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
```

### `src/chat/chat.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { AiService } from '../ai/ai.service';
import { MessageRole } from '../messages/entities/message.entity';
import { SendMessageDto } from './dto/send-message.dto';
import { QUEUES } from '../jobs/queues/queue.constants';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private retrievalService: RetrievalService,
    private aiService: AiService,
    @InjectQueue(QUEUES.MEMORY_PROCESSING) private memoryQueue: Queue,
  ) {}

  async send(userId: string, dto: SendMessageDto) {
    // 1. Get or create conversation
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conversation = await this.conversationsService.create(userId, {});
      conversationId = conversation.id;
    }

    // 2. Save user message
    const userMessage = await this.messagesService.create({
      conversationId,
      userId,
      role: MessageRole.USER,
      content: dto.message,
    });

    // 3. Retrieve context (RAG)
    const context = await this.retrievalService.getContext(
      userId,
      conversationId,
      dto.message,
    );

    // 4. Generate AI response
    const aiReply = await this.aiService.generateChatReply({
      systemPrompt: this.buildSystemPrompt(),
      retrievalContext: context,
      conversationHistory: context.recentMessages,
      userMessage: dto.message,
    });

    // 5. Save assistant message
    const assistantMessage = await this.messagesService.create({
      conversationId,
      userId,
      role: MessageRole.ASSISTANT,
      content: aiReply,
    });

    // 6. Update conversation counters
    await this.conversationsService.incrementMessageCount(conversationId);
    await this.conversationsService.incrementMessageCount(conversationId);

    // 7. Enqueue background memory processing (non-blocking)
    await this.memoryQueue.add(
      'process-message-memory',
      {
        messageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        conversationId,
        userId,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    this.logger.log(
      `Chat processed for conversation ${conversationId}`,
    );

    return {
      conversationId,
      message: userMessage,
      assistantMessage,
    };
  }

  private buildSystemPrompt(): string {
    return [
      'You are FriendAI, a warm and thoughtful AI companion.',
      'You remember details about the user from past conversations.',
      'Use the provided context to personalize your responses.',
      'Be conversational, empathetic, and genuine.',
      'If you recall something relevant from memory, mention it naturally.',
      'Never fabricate memories — only reference what is in the context.',
    ].join(' ');
  }
}
```

### `src/chat/chat.controller.ts`

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('send')
  send(@CurrentUser() user: User, @Body() dto: SendMessageDto) {
    return this.chatService.send(user.id, dto);
  }
}
```

### `src/chat/chat.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AiModule } from '../ai/ai.module';
import { QUEUES } from '../jobs/queues/queue.constants';

@Module({
  imports: [
    ConversationsModule,
    MessagesModule,
    RetrievalModule,
    AiModule,
    BullModule.registerQueue({ name: QUEUES.MEMORY_PROCESSING }),
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
```

---

## 12. AI Module

Abstract AI service that wraps LLM provider calls. Swappable between DeepSeek, Gemini, or any OpenAI-compatible API.

### Files

```
src/ai/
├── ai.module.ts
├── ai.service.ts
├── embedding.service.ts
└── prompts/
    ├── chat-system.prompt.ts
    ├── fact-extraction.prompt.ts
    ├── summarization.prompt.ts
    └── memory-classification.prompt.ts
```

### `src/ai/ai.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatContext,
  FactExtractionResult,
  MemoryClassification,
} from '../common/types';
import { FACT_EXTRACTION_PROMPT } from './prompts/fact-extraction.prompt';
import { MEMORY_CLASSIFICATION_PROMPT } from './prompts/memory-classification.prompt';
import { SUMMARIZATION_PROMPT } from './prompts/summarization.prompt';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private config: ConfigService) {
    this.provider = config.get('AI_PROVIDER', 'deepseek');
    this.apiKey = config.get('AI_API_KEY', '');
    this.model = config.get('AI_MODEL', 'deepseek-chat');
  }

  /**
   * Generate a chat reply using the full retrieval context.
   * Assembles the prompt with system instructions, retrieved memories,
   * facts, and conversation history, then calls the LLM.
   */
  async generateChatReply(context: ChatContext): Promise<string> {
    const messages = this.assembleChatMessages(context);
    const response = await this.callLLM(messages);
    return response;
  }

  /**
   * Classify whether a message exchange contains memorable information.
   * Returns structured classification with boolean flags and importance score.
   */
  async classifyMemory(
    userMessage: string,
    assistantMessage: string,
  ): Promise<MemoryClassification> {
    const prompt = MEMORY_CLASSIFICATION_PROMPT
      .replace('{{USER_MESSAGE}}', userMessage)
      .replace('{{ASSISTANT_MESSAGE}}', assistantMessage);

    const response = await this.callLLM([
      { role: 'system', content: 'You are a memory classification engine. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ]);

    return JSON.parse(response);
  }

  /**
   * Extract structured facts from a message.
   * Returns an array of fact objects with category, subject, predicate, value, confidence.
   */
  async extractFacts(messageContent: string): Promise<FactExtractionResult[]> {
    const prompt = FACT_EXTRACTION_PROMPT.replace(
      '{{MESSAGE}}',
      messageContent,
    );

    const response = await this.callLLM([
      { role: 'system', content: 'You are a fact extraction engine. Respond only with a valid JSON array.' },
      { role: 'user', content: prompt },
    ]);

    return JSON.parse(response);
  }

  /** Summarize a body of text (conversation, article, etc.). */
  async summarize(content: string): Promise<string> {
    const prompt = SUMMARIZATION_PROMPT.replace('{{CONTENT}}', content);

    return this.callLLM([
      { role: 'system', content: 'You are a summarization engine.' },
      { role: 'user', content: prompt },
    ]);
  }

  /**
   * Call the configured LLM provider.
   * Supports DeepSeek and Gemini via OpenAI-compatible API format.
   */
  private async callLLM(
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`LLM API error: ${response.status} ${error}`);
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private getBaseUrl(): string {
    switch (this.provider) {
      case 'deepseek':
        return 'https://api.deepseek.com/v1';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com/v1beta/openai';
      default:
        return this.config.get('AI_BASE_URL', 'https://api.deepseek.com/v1');
    }
  }

  /** Assemble the full message array for the LLM from retrieval context. */
  private assembleChatMessages(
    context: ChatContext,
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // System prompt with persona
    let systemContent = context.systemPrompt;

    // Inject retrieved facts
    if (context.retrievalContext.facts.length > 0) {
      const factsText = context.retrievalContext.facts
        .map((f) => `- ${f.subject}: ${f.value} (${f.category})`)
        .join('\n');
      systemContent += `\n\nKnown facts about the user:\n${factsText}`;
    }

    // Inject retrieved memories
    if (context.retrievalContext.memories.length > 0) {
      const memoriesText = context.retrievalContext.memories
        .map((m) => `- [${m.title}] ${m.content}`)
        .join('\n');
      systemContent += `\n\nRelevant past memories:\n${memoriesText}`;
    }

    // Inject people context
    if (context.retrievalContext.people.length > 0) {
      const peopleText = context.retrievalContext.people
        .map((p) => `- ${p.name} (${p.relationship}): ${p.notes}`)
        .join('\n');
      systemContent += `\n\nPeople the user has mentioned:\n${peopleText}`;
    }

    messages.push({ role: 'system', content: systemContent });

    // Conversation history
    for (const msg of context.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Current user message
    messages.push({ role: 'user', content: context.userMessage });

    return messages;
  }
}
```

### `src/ai/embedding.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingResult } from '../common/types';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.get('AI_API_KEY', '');
    this.model = config.get('AI_EMBEDDING_MODEL', 'text-embedding-3-small');
  }

  /** Generate a vector embedding for the given text. */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Embedding API error: ${response.status} ${error}`);
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      embedding: data.data[0].embedding,
      tokenCount: data.usage.total_tokens,
    };
  }

  /** Generate embeddings for multiple texts in batch. */
  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    // Process sequentially to respect rate limits
    for (const text of texts) {
      results.push(await this.generateEmbedding(text));
    }
    return results;
  }
}
```

### `src/ai/prompts/`

All prompt templates are maintained as standalone Markdown files in the [`prompts/`](../prompts/README.md) folder. The TypeScript files in `src/ai/prompts/` export string constants loaded from these templates.

| File | Prompt Template | Variable |
|------|----------------|----------|
| `chat-system.prompt.ts` | [`chat-system.prompt.md`](../prompts/chat-system.prompt.md) | `CHAT_SYSTEM_PROMPT` |
| `fact-extraction.prompt.ts` | [`fact-extraction.prompt.md`](../prompts/fact-extraction.prompt.md) | `FACT_EXTRACTION_PROMPT` |
| `summarization.prompt.ts` | [`summarization.prompt.md`](../prompts/summarization.prompt.md) | `SUMMARIZATION_PROMPT` |
| `memory-classification.prompt.ts` | [`memory-classification.prompt.md`](../prompts/memory-classification.prompt.md) | `MEMORY_CLASSIFICATION_PROMPT` |

### `src/ai/ai.module.ts`

```typescript
import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { EmbeddingService } from './embedding.service';

@Global()
@Module({
  providers: [AiService, EmbeddingService],
  exports: [AiService, EmbeddingService],
})
export class AiModule {}
```

---

## 13. Memories Module

Handles memory items and chunks. Provides semantic vector search using pgvector.

### Files

```
src/memories/
├── memories.module.ts
├── memories.controller.ts
├── memories.service.ts
├── entities/
│   ├── memory-item.entity.ts
│   └── memory-chunk.entity.ts
└── dto/
    └── search-memories.dto.ts
```

### `src/memories/entities/memory-item.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { MemoryChunk } from './memory-chunk.entity';

export enum SourceType {
  CONVERSATION = 'conversation',
  INGESTION = 'ingestion',
  MANUAL = 'manual',
}

export enum MemoryType {
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
}

@Entity('memory_items')
export class MemoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.memories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: SourceType })
  sourceType: SourceType;

  @Column({ type: 'uuid', nullable: true })
  sourceId: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'float', default: 0.5 })
  importance: number;

  @Column({ type: 'enum', enum: MemoryType, default: MemoryType.EPISODIC })
  memoryType: MemoryType;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => MemoryChunk, (c) => c.memoryItem)
  chunks: MemoryChunk[];
}
```

### `src/memories/entities/memory-chunk.entity.ts`

The core entity for vector search. The `embedding` column stores a 1536-dimensional vector.

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MemoryItem } from './memory-item.entity';

@Entity('memory_chunks')
export class MemoryChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  memoryItemId: string;

  @ManyToOne(() => MemoryItem, (m) => m.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memoryItemId' })
  memoryItem: MemoryItem;

  @Column()
  userId: string;

  @Column('text')
  content: string;

  /**
   * pgvector embedding column.
   * Stored as float[] for TypeORM compatibility.
   * Raw SQL queries use ::vector cast for similarity search.
   */
  @Column('float', { array: true, nullable: true })
  embedding: number[] | null;

  @Column({ default: 0 })
  chunkIndex: number;

  @Column({ nullable: true })
  tokenCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
```

### `src/memories/dto/search-memories.dto.ts`

```typescript
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchMemoriesDto {
  @IsString()
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
```

### `src/memories/memories.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MemoryItem, SourceType, MemoryType } from './entities/memory-item.entity';
import { MemoryChunk } from './entities/memory-chunk.entity';
import { EmbeddingService } from '../ai/embedding.service';

@Injectable()
export class MemoriesService {
  private readonly logger = new Logger(MemoriesService.name);

  constructor(
    @InjectRepository(MemoryItem)
    private memoryItemsRepo: Repository<MemoryItem>,
    @InjectRepository(MemoryChunk)
    private memoryChunksRepo: Repository<MemoryChunk>,
    private dataSource: DataSource,
    private embeddingService: EmbeddingService,
  ) {}

  /** Create a new memory item with optional chunks. */
  async createMemory(data: {
    userId: string;
    sourceType: SourceType;
    sourceId?: string;
    title: string;
    summary?: string;
    importance?: number;
    memoryType?: MemoryType;
    tags?: string[];
    chunks?: string[];
  }): Promise<MemoryItem> {
    const item = this.memoryItemsRepo.create({
      userId: data.userId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      title: data.title,
      summary: data.summary,
      importance: data.importance ?? 0.5,
      memoryType: data.memoryType ?? MemoryType.EPISODIC,
      tags: data.tags ?? [],
    });

    const savedItem = await this.memoryItemsRepo.save(item);

    // Create chunks if provided (embeddings generated later by job)
    if (data.chunks?.length) {
      const chunkEntities = data.chunks.map((content, index) =>
        this.memoryChunksRepo.create({
          memoryItemId: savedItem.id,
          userId: data.userId,
          content,
          chunkIndex: index,
          embedding: null,
        }),
      );
      await this.memoryChunksRepo.save(chunkEntities);
    }

    this.logger.log(`Created memory: ${savedItem.id} "${savedItem.title}"`);
    return savedItem;
  }

  /**
   * Semantic search using pgvector cosine similarity.
   * Embeds the query, then finds the closest memory chunks.
   */
  async searchMemories(
    userId: string,
    query: string,
    limit = 10,
  ): Promise<
    Array<{
      chunkId: string;
      content: string;
      similarity: number;
      memoryTitle: string;
      memorySummary: string;
      importance: number;
    }>
  > {
    const { embedding } = await this.embeddingService.generateEmbedding(query);
    const vectorStr = `[${embedding.join(',')}]`;

    // Raw SQL for pgvector cosine similarity search
    const results = await this.dataSource.query(
      `
      SELECT
        mc.id AS "chunkId",
        mc.content,
        1 - (mc.embedding::vector <=> $1::vector) AS similarity,
        mi.title AS "memoryTitle",
        mi.summary AS "memorySummary",
        mi.importance
      FROM memory_chunks mc
      JOIN memory_items mi ON mc."memoryItemId" = mi.id
      WHERE mc."userId" = $2
        AND mc.embedding IS NOT NULL
      ORDER BY mc.embedding::vector <=> $1::vector
      LIMIT $3
      `,
      [vectorStr, userId, limit],
    );

    // Update last accessed timestamp for retrieved memories
    const memoryIds = [
      ...new Set(results.map((r: any) => r.memoryTitle)),
    ];
    if (results.length > 0) {
      await this.memoryItemsRepo
        .createQueryBuilder()
        .update()
        .set({ lastAccessedAt: new Date() })
        .where('id IN (SELECT DISTINCT mi.id FROM memory_items mi JOIN memory_chunks mc ON mc."memoryItemId" = mi.id WHERE mc.id IN (:...ids))', {
          ids: results.map((r: any) => r.chunkId),
        })
        .execute();
    }

    return results;
  }

  /** Update the importance score of a memory item. */
  async updateImportance(memoryId: string, importance: number): Promise<void> {
    await this.memoryItemsRepo.update(memoryId, { importance });
  }

  /** Store an embedding for a specific chunk. */
  async storeChunkEmbedding(
    chunkId: string,
    embedding: number[],
  ): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.dataSource.query(
      `UPDATE memory_chunks SET embedding = $1::vector WHERE id = $2`,
      [vectorStr, chunkId],
    );
  }

  async findAllByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: MemoryItem[]; total: number }> {
    const [data, total] = await this.memoryItemsRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async deleteMemory(id: string, userId: string): Promise<void> {
    const memory = await this.memoryItemsRepo.findOne({
      where: { id, userId },
    });
    if (!memory) throw new NotFoundException('Memory not found');
    await this.memoryItemsRepo.remove(memory);
  }

  async getChunksByMemoryId(memoryItemId: string): Promise<MemoryChunk[]> {
    return this.memoryChunksRepo.find({
      where: { memoryItemId },
      order: { chunkIndex: 'ASC' },
    });
  }
}
```

### `src/memories/memories.controller.ts`

```typescript
import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MemoriesService } from './memories.service';
import { SearchMemoriesDto } from './dto/search-memories.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('memories')
export class MemoriesController {
  constructor(private memoriesService: MemoriesService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Query() pagination: PaginationDto) {
    return this.memoriesService.findAllByUser(
      user.id,
      pagination.page,
      pagination.limit,
    );
  }

  @Get('search')
  search(@CurrentUser() user: User, @Query() dto: SearchMemoriesDto) {
    return this.memoriesService.searchMemories(user.id, dto.q, dto.limit);
  }

  @Delete(':id')
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.memoriesService.deleteMemory(id, user.id);
  }
}
```

### `src/memories/memories.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemoryItem } from './entities/memory-item.entity';
import { MemoryChunk } from './entities/memory-chunk.entity';
import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';

@Module({
  imports: [TypeOrmModule.forFeature([MemoryItem, MemoryChunk])],
  controllers: [MemoriesController],
  providers: [MemoriesService],
  exports: [MemoriesService],
})
export class MemoriesModule {}
```

---

## 14. Retrieval Module

Combines multiple sources into a single context package for the AI.

### Files

```
src/retrieval/
├── retrieval.module.ts
└── retrieval.service.ts
```

### `src/retrieval/retrieval.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { MemoriesService } from '../memories/memories.service';
import { FactsService } from '../facts/facts.service';
import { PeopleService } from '../people/people.service';
import { RetrievalContext } from '../common/types';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private factsService: FactsService,
    private peopleService: PeopleService,
  ) {}

  /**
   * Assemble the full retrieval context for a chat message.
   * Pulls from 4 sources: recent messages, memory vector search,
   * long-term facts, and people mentions.
   */
  async getContext(
    userId: string,
    conversationId: string,
    userMessage: string,
  ): Promise<RetrievalContext> {
    // Run all retrievals in parallel
    const [recentMsgs, memories, facts, people] = await Promise.all([
      this.getRecentMessages(conversationId),
      this.getRelevantMemories(userId, userMessage),
      this.getRelevantFacts(userId, userMessage),
      this.getMentionedPeople(userId, userMessage),
    ]);

    this.logger.debug(
      `Retrieved context: ${recentMsgs.length} messages, ${memories.length} memories, ${facts.length} facts, ${people.length} people`,
    );

    return {
      recentMessages: recentMsgs,
      memories,
      facts,
      people,
    };
  }

  private async getRecentMessages(conversationId: string) {
    const messages = await this.messagesService.getRecentMessages(
      conversationId,
      20,
    );
    return messages.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  private async getRelevantMemories(userId: string, query: string) {
    try {
      const results = await this.memoriesService.searchMemories(
        userId,
        query,
        10,
      );

      // Apply composite reranking score
      return results
        .map((r) => ({
          content: r.content,
          similarity: r.similarity,
          title: r.memoryTitle,
          score: this.calculateScore(r.similarity, r.importance),
        }))
        .sort((a, b) => b.score - a.score);
    } catch (error) {
      this.logger.warn(`Memory search failed: ${error.message}`);
      return [];
    }
  }

  private async getRelevantFacts(userId: string, query: string) {
    return this.factsService.findRelevantFacts(userId, query, 10);
  }

  private async getMentionedPeople(userId: string, message: string) {
    return this.peopleService.findMentionedPeople(userId, message);
  }

  /**
   * Composite reranking score.
   * similarity (0.7 weight) + importance (0.3 weight)
   */
  private calculateScore(similarity: number, importance: number): number {
    return 0.7 * similarity + 0.3 * importance;
  }
}
```

### `src/retrieval/retrieval.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { MessagesModule } from '../messages/messages.module';
import { MemoriesModule } from '../memories/memories.module';
import { FactsModule } from '../facts/facts.module';
import { PeopleModule } from '../people/people.module';

@Module({
  imports: [MessagesModule, MemoriesModule, FactsModule, PeopleModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
```

---

## 15. Facts Module

Structured facts extracted from conversations. Queryable without vector search.

### Files

```
src/facts/
├── facts.module.ts
├── facts.service.ts
└── entities/
    └── user-fact.entity.ts
```

### `src/facts/entities/user-fact.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum FactCategory {
  PREFERENCE = 'preference',
  GOAL = 'goal',
  RELATIONSHIP = 'relationship',
  EVENT = 'event',
  EMOTION = 'emotion',
  BIOGRAPHICAL = 'biographical',
  OPINION = 'opinion',
  ROUTINE = 'routine',
}

@Entity('user_facts')
export class UserFact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.facts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: FactCategory })
  category: FactCategory;

  @Column()
  subject: string;

  @Column({ nullable: true })
  predicate: string;

  @Column('text')
  value: string;

  @Column({ type: 'float', default: 0.8 })
  confidence: number;

  @Column({ type: 'uuid', nullable: true })
  sourceMessageId: string;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### `src/facts/facts.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserFact, FactCategory } from './entities/user-fact.entity';

@Injectable()
export class FactsService {
  private readonly logger = new Logger(FactsService.name);

  constructor(
    @InjectRepository(UserFact)
    private factsRepo: Repository<UserFact>,
  ) {}

  /**
   * Upsert a fact. If a conflicting fact exists (same user + subject + predicate),
   * deactivate the old one and create the new one.
   */
  async upsertFact(data: {
    userId: string;
    category: FactCategory;
    subject: string;
    predicate?: string;
    value: string;
    confidence: number;
    sourceMessageId?: string;
  }): Promise<UserFact> {
    // Deactivate conflicting facts
    if (data.predicate) {
      await this.factsRepo.update(
        {
          userId: data.userId,
          subject: data.subject,
          predicate: data.predicate,
          isActive: true,
        },
        { isActive: false },
      );
    }

    const fact = this.factsRepo.create(data);
    const saved = await this.factsRepo.save(fact);
    this.logger.log(`Upserted fact: ${data.subject} ${data.predicate} = ${data.value}`);
    return saved;
  }

  /** Find facts relevant to a query by matching subject or value. */
  async findRelevantFacts(
    userId: string,
    query: string,
    limit = 10,
  ): Promise<Array<{ category: string; subject: string; value: string }>> {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (keywords.length === 0) {
      return this.getCoreUserFacts(userId, limit);
    }

    const qb = this.factsRepo
      .createQueryBuilder('f')
      .select(['f.category', 'f.subject', 'f.value'])
      .where('f.userId = :userId', { userId })
      .andWhere('f.isActive = true');

    // Match any keyword against subject or value
    const conditions = keywords.map(
      (_, i) =>
        `(LOWER(f.subject) LIKE :kw${i} OR LOWER(f.value) LIKE :kw${i})`,
    );
    const params: Record<string, string> = {};
    keywords.forEach((kw, i) => {
      params[`kw${i}`] = `%${kw}%`;
    });
    qb.andWhere(`(${conditions.join(' OR ')})`, params);

    qb.orderBy('f.confidence', 'DESC')
      .addOrderBy('f.updatedAt', 'DESC')
      .limit(limit);

    return qb.getRawMany();
  }

  /** Always include high-confidence core facts regardless of query. */
  private async getCoreUserFacts(
    userId: string,
    limit: number,
  ): Promise<Array<{ category: string; subject: string; value: string }>> {
    return this.factsRepo
      .createQueryBuilder('f')
      .select(['f.category', 'f.subject', 'f.value'])
      .where('f.userId = :userId', { userId })
      .andWhere('f.isActive = true')
      .andWhere('f.confidence >= 0.8')
      .orderBy('f.confidence', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  async findAllByUser(userId: string): Promise<UserFact[]> {
    return this.factsRepo.find({
      where: { userId, isActive: true },
      order: { category: 'ASC', updatedAt: 'DESC' },
    });
  }
}
```

### `src/facts/facts.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserFact } from './entities/user-fact.entity';
import { FactsService } from './facts.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserFact])],
  providers: [FactsService],
  exports: [FactsService],
})
export class FactsModule {}
```

---

## 16. People Module

### Files

```
src/people/
├── people.module.ts
├── people.service.ts
└── entities/
    └── person.entity.ts
```

### `src/people/entities/person.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('people')
export class Person {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.people, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  name: string;

  @Column({ nullable: true })
  relationship: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: 1 })
  mentionCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastMentionedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### `src/people/people.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Person } from './entities/person.entity';

@Injectable()
export class PeopleService {
  constructor(
    @InjectRepository(Person)
    private peopleRepo: Repository<Person>,
  ) {}

  /** Find people whose names appear in the message text. */
  async findMentionedPeople(
    userId: string,
    message: string,
  ): Promise<Array<{ name: string; relationship: string; notes: string }>> {
    const allPeople = await this.peopleRepo.find({ where: { userId } });
    const lowerMessage = message.toLowerCase();

    return allPeople
      .filter((p) => lowerMessage.includes(p.name.toLowerCase()))
      .map((p) => ({
        name: p.name,
        relationship: p.relationship || 'unknown',
        notes: p.notes || '',
      }));
  }

  /** Create or update a person record. Merges by name (case-insensitive). */
  async upsertPerson(data: {
    userId: string;
    name: string;
    relationship?: string;
    notes?: string;
  }): Promise<Person> {
    let person = await this.peopleRepo
      .createQueryBuilder('p')
      .where('p.userId = :userId', { userId: data.userId })
      .andWhere('LOWER(p.name) = LOWER(:name)', { name: data.name })
      .getOne();

    if (person) {
      person.mentionCount += 1;
      person.lastMentionedAt = new Date();
      if (data.relationship) person.relationship = data.relationship;
      if (data.notes) {
        person.notes = person.notes
          ? `${person.notes}\n${data.notes}`
          : data.notes;
      }
    } else {
      person = this.peopleRepo.create({
        userId: data.userId,
        name: data.name,
        relationship: data.relationship,
        notes: data.notes,
        lastMentionedAt: new Date(),
      });
    }

    return this.peopleRepo.save(person);
  }
}
```

### `src/people/people.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from './entities/person.entity';
import { PeopleService } from './people.service';

@Module({
  imports: [TypeOrmModule.forFeature([Person])],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
```

---

## 17. Ingestion Module

Handles content shared from the mobile share sheet.

### Files

```
src/ingestion/
├── ingestion.module.ts
├── ingestion.controller.ts
├── ingestion.service.ts
├── entities/
│   └── ingested-item.entity.ts
└── dto/
    ├── share-link.dto.ts
    ├── share-text.dto.ts
    ├── share-file-init.dto.ts
    └── share-file-complete.dto.ts
```

### `src/ingestion/entities/ingested-item.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FileObject } from '../../files/entities/file-object.entity';

export enum IngestedItemType {
  LINK = 'link',
  YOUTUBE = 'youtube',
  TEXT = 'text',
  PDF = 'pdf',
  IMAGE = 'image',
}

export enum IngestedItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('ingested_items')
export class IngestedItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: IngestedItemType })
  type: IngestedItemType;

  @Column({ type: 'text', nullable: true })
  sourceUrl: string;

  @Column({ type: 'text', nullable: true })
  rawContent: string;

  @Column({ type: 'text', nullable: true })
  processedContent: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'uuid', nullable: true })
  fileId: string;

  @ManyToOne(() => FileObject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fileId' })
  file: FileObject;

  @Column({
    type: 'enum',
    enum: IngestedItemStatus,
    default: IngestedItemStatus.PENDING,
  })
  status: IngestedItemStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
```

### `src/ingestion/dto/share-link.dto.ts`

```typescript
import { IsUrl } from 'class-validator';

export class ShareLinkDto {
  @IsUrl()
  url: string;
}
```

### `src/ingestion/dto/share-text.dto.ts`

```typescript
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class ShareTextDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
```

### `src/ingestion/dto/share-file-init.dto.ts`

```typescript
import { IsString, IsInt, Min } from 'class-validator';

export class ShareFileInitDto {
  @IsString()
  filename: string;

  @IsString()
  mimeType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;
}
```

### `src/ingestion/dto/share-file-complete.dto.ts`

```typescript
import { IsUUID } from 'class-validator';

export class ShareFileCompleteDto {
  @IsUUID()
  fileId: string;
}
```

### `src/ingestion/ingestion.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import {
  IngestedItem,
  IngestedItemType,
  IngestedItemStatus,
} from './entities/ingested-item.entity';
import { FilesService } from '../files/files.service';
import { StorageService } from '../storage/storage.service';
import { QUEUES } from '../jobs/queues/queue.constants';
import { ShareLinkDto } from './dto/share-link.dto';
import { ShareTextDto } from './dto/share-text.dto';
import { ShareFileInitDto } from './dto/share-file-init.dto';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(IngestedItem)
    private ingestedRepo: Repository<IngestedItem>,
    private filesService: FilesService,
    private storageService: StorageService,
    @InjectQueue(QUEUES.FILE_PROCESSING) private fileQueue: Queue,
  ) {}

  async shareLink(userId: string, dto: ShareLinkDto) {
    const isYouTube = /youtube\.com|youtu\.be/.test(dto.url);

    const item = this.ingestedRepo.create({
      userId,
      type: isYouTube ? IngestedItemType.YOUTUBE : IngestedItemType.LINK,
      sourceUrl: dto.url,
      status: IngestedItemStatus.PENDING,
    });
    const saved = await this.ingestedRepo.save(item);

    await this.fileQueue.add(
      'process-shared-link',
      { ingestedItemId: saved.id, userId, url: dto.url },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    return { id: saved.id, status: 'processing' };
  }

  async shareText(userId: string, dto: ShareTextDto) {
    const item = this.ingestedRepo.create({
      userId,
      type: IngestedItemType.TEXT,
      rawContent: dto.text,
      title: dto.title,
      status: IngestedItemStatus.PENDING,
    });
    const saved = await this.ingestedRepo.save(item);

    await this.fileQueue.add(
      'process-shared-text',
      { ingestedItemId: saved.id, userId, text: dto.text },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    return { id: saved.id, status: 'processing' };
  }

  async shareFileInit(userId: string, dto: ShareFileInitDto) {
    const file = await this.filesService.createPendingFile(userId, dto);
    const uploadUrl = await this.storageService.generateUploadUrl(
      file.objectKey,
      file.bucket,
      dto.mimeType,
    );

    return {
      fileId: file.id,
      uploadUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async shareFileComplete(userId: string, fileId: string) {
    const file = await this.filesService.markUploaded(fileId, userId);
    if (!file) throw new NotFoundException('File not found');

    const mimeType = file.mimeType;
    let type = IngestedItemType.TEXT;
    if (mimeType === 'application/pdf') type = IngestedItemType.PDF;
    else if (mimeType.startsWith('image/')) type = IngestedItemType.IMAGE;

    const item = this.ingestedRepo.create({
      userId,
      type,
      fileId: file.id,
      status: IngestedItemStatus.PENDING,
    });
    const saved = await this.ingestedRepo.save(item);

    await this.fileQueue.add(
      'process-uploaded-file',
      { ingestedItemId: saved.id, fileId: file.id, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    return { id: saved.id, status: 'processing' };
  }

  async updateStatus(
    id: string,
    status: IngestedItemStatus,
    updates?: Partial<IngestedItem>,
  ): Promise<void> {
    await this.ingestedRepo.update(id, { status, ...updates });
  }
}
```

### `src/ingestion/ingestion.controller.ts`

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { ShareLinkDto } from './dto/share-link.dto';
import { ShareTextDto } from './dto/share-text.dto';
import { ShareFileInitDto } from './dto/share-file-init.dto';
import { ShareFileCompleteDto } from './dto/share-file-complete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('ingestion')
export class IngestionController {
  constructor(private ingestionService: IngestionService) {}

  @Post('share-link')
  shareLink(@CurrentUser() user: User, @Body() dto: ShareLinkDto) {
    return this.ingestionService.shareLink(user.id, dto);
  }

  @Post('share-text')
  shareText(@CurrentUser() user: User, @Body() dto: ShareTextDto) {
    return this.ingestionService.shareText(user.id, dto);
  }

  @Post('share-file/init')
  shareFileInit(@CurrentUser() user: User, @Body() dto: ShareFileInitDto) {
    return this.ingestionService.shareFileInit(user.id, dto);
  }

  @Post('share-file/complete')
  shareFileComplete(
    @CurrentUser() user: User,
    @Body() dto: ShareFileCompleteDto,
  ) {
    return this.ingestionService.shareFileComplete(user.id, dto.fileId);
  }
}
```

### `src/ingestion/ingestion.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestedItem } from './entities/ingested-item.entity';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { QUEUES } from '../jobs/queues/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([IngestedItem]),
    BullModule.registerQueue({ name: QUEUES.FILE_PROCESSING }),
    FilesModule,
    StorageModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
```

---

## 18. Content Processing Module

Processors for each content type. Called by background jobs.

### Files

```
src/content-processing/
├── content-processing.module.ts
├── content-processing.service.ts
└── processors/
    ├── link.processor.ts
    ├── youtube.processor.ts
    ├── pdf.processor.ts
    ├── image.processor.ts
    └── text.processor.ts
```

### `src/content-processing/content-processing.service.ts`

Router that dispatches to the correct processor based on content type.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { LinkContentProcessor } from './processors/link.processor';
import { YoutubeContentProcessor } from './processors/youtube.processor';
import { PdfContentProcessor } from './processors/pdf.processor';
import { ImageContentProcessor } from './processors/image.processor';
import { TextContentProcessor } from './processors/text.processor';

export interface ProcessedContent {
  title: string;
  text: string;
  summary?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ContentProcessingService {
  private readonly logger = new Logger(ContentProcessingService.name);

  constructor(
    private linkProcessor: LinkContentProcessor,
    private youtubeProcessor: YoutubeContentProcessor,
    private pdfProcessor: PdfContentProcessor,
    private imageProcessor: ImageContentProcessor,
    private textProcessor: TextContentProcessor,
  ) {}

  async processLink(url: string): Promise<ProcessedContent> {
    return this.linkProcessor.process(url);
  }

  async processYoutube(url: string): Promise<ProcessedContent> {
    return this.youtubeProcessor.process(url);
  }

  async processPdf(fileBuffer: Buffer): Promise<ProcessedContent> {
    return this.pdfProcessor.process(fileBuffer);
  }

  async processImage(fileBuffer: Buffer): Promise<ProcessedContent> {
    return this.imageProcessor.process(fileBuffer);
  }

  async processText(text: string): Promise<ProcessedContent> {
    return this.textProcessor.process(text);
  }
}
```

### `src/content-processing/processors/link.processor.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProcessedContent } from '../content-processing.service';

@Injectable()
export class LinkContentProcessor {
  private readonly logger = new Logger(LinkContentProcessor.name);

  async process(url: string): Promise<ProcessedContent> {
    this.logger.log(`Processing link: ${url}`);

    // TODO: Implement with a readability library (e.g., @mozilla/readability + jsdom)
    // 1. Fetch HTML from URL
    // 2. Extract readable content
    // 3. Strip tags, clean text
    // 4. Extract title, author, description

    return {
      title: `Content from ${new URL(url).hostname}`,
      text: `Placeholder: fetched content from ${url}`,
      metadata: { sourceUrl: url },
    };
  }
}
```

### `src/content-processing/processors/youtube.processor.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProcessedContent } from '../content-processing.service';

@Injectable()
export class YoutubeContentProcessor {
  private readonly logger = new Logger(YoutubeContentProcessor.name);

  async process(url: string): Promise<ProcessedContent> {
    this.logger.log(`Processing YouTube: ${url}`);

    // TODO: Implement with youtube transcript API
    // 1. Extract video ID from URL
    // 2. Fetch transcript
    // 3. Fetch metadata (title, channel, duration)

    return {
      title: `YouTube video`,
      text: `Placeholder: transcript from ${url}`,
      metadata: { sourceUrl: url, type: 'youtube' },
    };
  }
}
```

### `src/content-processing/processors/pdf.processor.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProcessedContent } from '../content-processing.service';

@Injectable()
export class PdfContentProcessor {
  private readonly logger = new Logger(PdfContentProcessor.name);

  async process(fileBuffer: Buffer): Promise<ProcessedContent> {
    this.logger.log(`Processing PDF (${fileBuffer.length} bytes)`);

    // TODO: Implement with pdf-parse
    // 1. Extract text from all pages
    // 2. Extract metadata (title, author, page count)

    return {
      title: 'PDF Document',
      text: 'Placeholder: extracted PDF text',
      metadata: { pageCount: 0, sizeBytes: fileBuffer.length },
    };
  }
}
```

### `src/content-processing/processors/image.processor.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProcessedContent } from '../content-processing.service';

@Injectable()
export class ImageContentProcessor {
  private readonly logger = new Logger(ImageContentProcessor.name);

  async process(fileBuffer: Buffer): Promise<ProcessedContent> {
    this.logger.log(`Processing image (${fileBuffer.length} bytes)`);

    // TODO: Implement with vision LLM
    // 1. Send image to vision model for description
    // 2. Run OCR if text is detected

    return {
      title: 'Image',
      text: 'Placeholder: image description',
      metadata: { sizeBytes: fileBuffer.length },
    };
  }
}
```

### `src/content-processing/processors/text.processor.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProcessedContent } from '../content-processing.service';

@Injectable()
export class TextContentProcessor {
  private readonly logger = new Logger(TextContentProcessor.name);

  async process(text: string): Promise<ProcessedContent> {
    this.logger.log(`Processing text (${text.length} chars)`);

    return {
      title: text.slice(0, 80).replace(/\n/g, ' '),
      text,
      metadata: { charCount: text.length },
    };
  }
}
```

### `src/content-processing/content-processing.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ContentProcessingService } from './content-processing.service';
import { LinkContentProcessor } from './processors/link.processor';
import { YoutubeContentProcessor } from './processors/youtube.processor';
import { PdfContentProcessor } from './processors/pdf.processor';
import { ImageContentProcessor } from './processors/image.processor';
import { TextContentProcessor } from './processors/text.processor';

@Module({
  providers: [
    ContentProcessingService,
    LinkContentProcessor,
    YoutubeContentProcessor,
    PdfContentProcessor,
    ImageContentProcessor,
    TextContentProcessor,
  ],
  exports: [ContentProcessingService],
})
export class ContentProcessingModule {}
```

---

## 19. Files Module

### Files

```
src/files/
├── files.module.ts
├── files.controller.ts
├── files.service.ts
└── entities/
    └── file-object.entity.ts
```

### `src/files/entities/file-object.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum FileStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('files')
export class FileObject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  filename: string;

  @Column()
  mimeType: string;

  @Column({ type: 'bigint' })
  sizeBytes: number;

  @Column()
  bucket: string;

  @Column()
  objectKey: string;

  @Column({ type: 'enum', enum: FileStatus, default: FileStatus.PENDING })
  status: FileStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
```

### `src/files/files.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FileObject, FileStatus } from './entities/file-object.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileObject)
    private filesRepo: Repository<FileObject>,
    private storageService: StorageService,
  ) {}

  async createPendingFile(
    userId: string,
    data: { filename: string; mimeType: string; sizeBytes: number },
  ): Promise<FileObject> {
    const bucket = this.getBucketForMimeType(data.mimeType);
    const now = new Date();
    const objectKey = `${userId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${uuidv4()}-${data.filename}`;

    const file = this.filesRepo.create({
      userId,
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      bucket,
      objectKey,
      status: FileStatus.PENDING,
    });

    return this.filesRepo.save(file);
  }

  async markUploaded(id: string, userId: string): Promise<FileObject | null> {
    const file = await this.filesRepo.findOne({
      where: { id, userId, status: FileStatus.PENDING },
    });
    if (!file) return null;
    file.status = FileStatus.UPLOADED;
    return this.filesRepo.save(file);
  }

  async updateStatus(id: string, status: FileStatus): Promise<void> {
    await this.filesRepo.update(id, { status });
  }

  async getDownloadUrl(id: string, userId: string): Promise<{ downloadUrl: string; expiresAt: string }> {
    const file = await this.filesRepo.findOne({ where: { id, userId } });
    if (!file) throw new NotFoundException('File not found');

    const downloadUrl = await this.storageService.generateDownloadUrl(
      file.objectKey,
      file.bucket,
    );

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  async findById(id: string): Promise<FileObject | null> {
    return this.filesRepo.findOne({ where: { id } });
  }

  private getBucketForMimeType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'user-images';
    if (mimeType.startsWith('audio/')) return 'user-audio';
    return 'user-attachments';
  }
}
```

### `src/files/files.controller.ts`

```typescript
import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ShareFileInitDto } from '../ingestion/dto/share-file-init.dto';

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(
    private filesService: FilesService,
    private storageService: StorageService,
  ) {}

  @Post('upload-url')
  async getUploadUrl(
    @CurrentUser() user: User,
    @Body() dto: ShareFileInitDto,
  ) {
    const file = await this.filesService.createPendingFile(user.id, dto);
    const uploadUrl = await this.storageService.generateUploadUrl(
      file.objectKey,
      file.bucket,
      dto.mimeType,
    );

    return {
      fileId: file.id,
      uploadUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  @Get(':id/url')
  getDownloadUrl(@CurrentUser() user: User, @Param('id') id: string) {
    return this.filesService.getDownloadUrl(id, user.id);
  }
}
```

### `src/files/files.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileObject } from './entities/file-object.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([FileObject]), StorageModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
```

---

## 20. Storage Module

MinIO integration. Manages buckets and presigned URLs.

### Files

```
src/storage/
├── storage.module.ts
└── storage.service.ts
```

### `src/storage/storage.service.ts`

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

const BUCKETS = ['user-audio', 'user-images', 'user-attachments', 'user-exports'];

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;

  constructor(private config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.config.get('MINIO_ENDPOINT', 'localhost'),
      port: this.config.get<number>('MINIO_PORT', 9000),
      useSSL: this.config.get('MINIO_USE_SSL') === 'true',
      accessKey: this.config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  /** Create all required buckets on startup if they don't exist. */
  async onModuleInit() {
    for (const bucket of BUCKETS) {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket);
        this.logger.log(`Created bucket: ${bucket}`);
      }
    }
  }

  /** Generate a presigned PUT URL for direct upload from mobile. */
  async generateUploadUrl(
    objectKey: string,
    bucket: string,
    contentType: string,
    expirySeconds = 900,
  ): Promise<string> {
    return this.client.presignedPutObject(bucket, objectKey, expirySeconds);
  }

  /** Generate a presigned GET URL for download. */
  async generateDownloadUrl(
    objectKey: string,
    bucket: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, objectKey, expirySeconds);
  }

  /** Download an object as a Buffer. Used by file processing jobs. */
  async download(objectKey: string, bucket: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /** Upload a buffer directly. */
  async upload(
    objectKey: string,
    bucket: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.putObject(bucket, objectKey, data, undefined, metadata);
  }

  /** Delete an object. */
  async delete(objectKey: string, bucket: string): Promise<void> {
    await this.client.removeObject(bucket, objectKey);
  }

  /** Check if MinIO is reachable. Used by health checks. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.listBuckets();
      return true;
    } catch {
      return false;
    }
  }
}
```

### `src/storage/storage.module.ts`

```typescript
import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

---

## 21. Jobs Module

BullMQ processors for all background work.

### Files

```
src/jobs/
├── jobs.module.ts
├── queues/
│   └── queue.constants.ts
└── processors/
    ├── memory-processing.processor.ts
    ├── embedding.processor.ts
    ├── fact-extraction.processor.ts
    └── file-processing.processor.ts
```

### `src/jobs/queues/queue.constants.ts`

```typescript
export const QUEUES = {
  MEMORY_PROCESSING: 'memory-processing',
  EMBEDDING_GENERATION: 'embedding-generation',
  FACT_EXTRACTION: 'fact-extraction',
  FILE_PROCESSING: 'file-processing',
} as const;
```

### `src/jobs/processors/memory-processing.processor.ts`

Runs after every chat message. Classifies significance, creates memories, and spawns follow-up jobs.

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { MessagesService } from '../../messages/messages.service';
import { MemoriesService } from '../../memories/memories.service';
import { AiService } from '../../ai/ai.service';
import { SourceType } from '../../memories/entities/memory-item.entity';
import { chunkText } from '../../common/utils/chunk.util';

@Processor(QUEUES.MEMORY_PROCESSING)
export class MemoryProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryProcessingProcessor.name);

  constructor(
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private aiService: AiService,
    @InjectQueue(QUEUES.EMBEDDING_GENERATION) private embeddingQueue: Queue,
    @InjectQueue(QUEUES.FACT_EXTRACTION) private factQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { messageId, assistantMessageId, conversationId, userId } = job.data;
    this.logger.log(`Processing memory for message ${messageId}`);

    const userMsg = await this.messagesService.findById(messageId);
    const assistantMsg = await this.messagesService.findById(assistantMessageId);
    if (!userMsg || !assistantMsg) return;

    // Step 1: Classify if this exchange is memorable
    const classification = await this.aiService.classifyMemory(
      userMsg.content,
      assistantMsg.content,
    );

    if (!classification.isMemorable) {
      this.logger.debug(`Message ${messageId} not memorable, skipping`);
      return;
    }

    // Step 2: Create memory item + chunks
    const combinedText = `User: ${userMsg.content}\nAssistant: ${assistantMsg.content}`;
    const chunks = chunkText(combinedText, { maxTokens: 500, overlap: 50 });

    const memory = await this.memoriesService.createMemory({
      userId,
      sourceType: SourceType.CONVERSATION,
      sourceId: conversationId,
      title: userMsg.content.slice(0, 100),
      importance: classification.importance,
      chunks,
    });

    // Step 3: Enqueue embedding generation for each chunk
    const memoryChunks = await this.memoriesService.getChunksByMemoryId(memory.id);
    for (const chunk of memoryChunks) {
      await this.embeddingQueue.add(
        'generate-embedding',
        { chunkId: chunk.id, content: chunk.content },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    }

    // Step 4: Enqueue fact extraction if relevant categories detected
    if (
      classification.containsFact ||
      classification.containsGoal ||
      classification.containsPreference ||
      classification.containsRelationship
    ) {
      await this.factQueue.add(
        'extract-facts',
        { messageId, userId, content: userMsg.content },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    }

    this.logger.log(`Memory created: ${memory.id} (importance: ${classification.importance})`);
  }
}
```

### `src/jobs/processors/embedding.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { MemoriesService } from '../../memories/memories.service';
import { EmbeddingService } from '../../ai/embedding.service';

@Processor(QUEUES.EMBEDDING_GENERATION)
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private memoriesService: MemoriesService,
    private embeddingService: EmbeddingService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { chunkId, content } = job.data;
    this.logger.log(`Generating embedding for chunk ${chunkId}`);

    const { embedding } = await this.embeddingService.generateEmbedding(content);
    await this.memoriesService.storeChunkEmbedding(chunkId, embedding);

    this.logger.log(`Embedding stored for chunk ${chunkId} (${embedding.length} dimensions)`);
  }
}
```

### `src/jobs/processors/fact-extraction.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { AiService } from '../../ai/ai.service';
import { FactsService } from '../../facts/facts.service';
import { PeopleService } from '../../people/people.service';
import { FactCategory } from '../../facts/entities/user-fact.entity';

@Processor(QUEUES.FACT_EXTRACTION)
export class FactExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(FactExtractionProcessor.name);

  constructor(
    private aiService: AiService,
    private factsService: FactsService,
    private peopleService: PeopleService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { messageId, userId, content } = job.data;
    this.logger.log(`Extracting facts from message ${messageId}`);

    const extractedFacts = await this.aiService.extractFacts(content);

    for (const fact of extractedFacts) {
      await this.factsService.upsertFact({
        userId,
        category: fact.category as FactCategory,
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        confidence: fact.confidence,
        sourceMessageId: messageId,
      });

      // If the fact is about a relationship, upsert the person record
      if (fact.category === 'relationship') {
        await this.peopleService.upsertPerson({
          userId,
          name: fact.subject,
          relationship: fact.predicate,
          notes: fact.value,
        });
      }
    }

    this.logger.log(`Extracted ${extractedFacts.length} facts from message ${messageId}`);
  }
}
```

### `src/jobs/processors/file-processing.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { ContentProcessingService } from '../../content-processing/content-processing.service';
import { MemoriesService } from '../../memories/memories.service';
import { IngestionService } from '../../ingestion/ingestion.service';
import { FilesService } from '../../files/files.service';
import { StorageService } from '../../storage/storage.service';
import { AiService } from '../../ai/ai.service';
import { SourceType, MemoryType } from '../../memories/entities/memory-item.entity';
import { IngestedItemStatus } from '../../ingestion/entities/ingested-item.entity';
import { FileStatus } from '../../files/entities/file-object.entity';
import { chunkText } from '../../common/utils/chunk.util';

@Processor(QUEUES.FILE_PROCESSING)
export class FileProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessingProcessor.name);

  constructor(
    private contentProcessing: ContentProcessingService,
    private memoriesService: MemoriesService,
    private ingestionService: IngestionService,
    private filesService: FilesService,
    private storageService: StorageService,
    private aiService: AiService,
    @InjectQueue(QUEUES.EMBEDDING_GENERATION) private embeddingQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'process-shared-link':
        return this.processSharedLink(job);
      case 'process-shared-text':
        return this.processSharedText(job);
      case 'process-uploaded-file':
        return this.processUploadedFile(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async processSharedLink(job: Job): Promise<void> {
    const { ingestedItemId, userId, url } = job.data;
    this.logger.log(`Processing shared link: ${url}`);

    try {
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.PROCESSING);

      const isYouTube = /youtube\.com|youtu\.be/.test(url);
      const result = isYouTube
        ? await this.contentProcessing.processYoutube(url)
        : await this.contentProcessing.processLink(url);

      const summary = await this.aiService.summarize(result.text);
      const chunks = chunkText(result.text, { maxTokens: 500, overlap: 50 });

      const memory = await this.memoriesService.createMemory({
        userId,
        sourceType: SourceType.INGESTION,
        sourceId: ingestedItemId,
        title: result.title,
        summary,
        memoryType: MemoryType.SEMANTIC,
        importance: 0.5,
        chunks,
      });

      await this.enqueueEmbeddings(memory.id);
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.PROCESSED, {
        title: result.title,
        processedContent: summary,
      });
    } catch (error) {
      this.logger.error(`Failed to process link: ${error.message}`);
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.FAILED);
      throw error;
    }
  }

  private async processSharedText(job: Job): Promise<void> {
    const { ingestedItemId, userId, text } = job.data;
    this.logger.log(`Processing shared text (${text.length} chars)`);

    try {
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.PROCESSING);

      const result = await this.contentProcessing.processText(text);
      const chunks = chunkText(result.text, { maxTokens: 500, overlap: 50 });

      const memory = await this.memoriesService.createMemory({
        userId,
        sourceType: SourceType.INGESTION,
        sourceId: ingestedItemId,
        title: result.title,
        memoryType: MemoryType.SEMANTIC,
        importance: 0.4,
        chunks,
      });

      await this.enqueueEmbeddings(memory.id);
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.PROCESSED, {
        title: result.title,
      });
    } catch (error) {
      this.logger.error(`Failed to process text: ${error.message}`);
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.FAILED);
      throw error;
    }
  }

  private async processUploadedFile(job: Job): Promise<void> {
    const { ingestedItemId, fileId, userId } = job.data;
    this.logger.log(`Processing uploaded file: ${fileId}`);

    try {
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.PROCESSING);
      await this.filesService.updateStatus(fileId, FileStatus.PROCESSING);

      const file = await this.filesService.findById(fileId);
      if (!file) throw new Error(`File not found: ${fileId}`);

      const fileBuffer = await this.storageService.download(file.objectKey, file.bucket);

      let result;
      if (file.mimeType === 'application/pdf') {
        result = await this.contentProcessing.processPdf(fileBuffer);
      } else if (file.mimeType.startsWith('image/')) {
        result = await this.contentProcessing.processImage(fileBuffer);
      } else {
        result = await this.contentProcessing.processText(fileBuffer.toString());
      }

      const summary = await this.aiService.summarize(result.text);
      const chunks = chunkText(result.text, { maxTokens: 500, overlap: 50 });

      const memory = await this.memoriesService.createMemory({
        userId,
        sourceType: SourceType.INGESTION,
        sourceId: ingestedItemId,
        title: result.title,
        summary,
        memoryType: MemoryType.SEMANTIC,
        importance: 0.5,
        chunks,
      });

      await this.enqueueEmbeddings(memory.id);
      await this.filesService.updateStatus(fileId, FileStatus.PROCESSED);
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.PROCESSED, {
        title: result.title,
        processedContent: summary,
      });
    } catch (error) {
      this.logger.error(`Failed to process file: ${error.message}`);
      await this.filesService.updateStatus(fileId, FileStatus.FAILED);
      await this.ingestionService.updateStatus(ingestedItemId, IngestedItemStatus.FAILED);
      throw error;
    }
  }

  private async enqueueEmbeddings(memoryId: string): Promise<void> {
    const chunks = await this.memoriesService.getChunksByMemoryId(memoryId);
    for (const chunk of chunks) {
      await this.embeddingQueue.add(
        'generate-embedding',
        { chunkId: chunk.id, content: chunk.content },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    }
  }
}
```

### `src/jobs/jobs.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from './queues/queue.constants';
import { MemoryProcessingProcessor } from './processors/memory-processing.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';
import { FactExtractionProcessor } from './processors/fact-extraction.processor';
import { FileProcessingProcessor } from './processors/file-processing.processor';
import { MessagesModule } from '../messages/messages.module';
import { MemoriesModule } from '../memories/memories.module';
import { FactsModule } from '../facts/facts.module';
import { PeopleModule } from '../people/people.module';
import { FilesModule } from '../files/files.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { ContentProcessingModule } from '../content-processing/content-processing.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.MEMORY_PROCESSING },
      { name: QUEUES.EMBEDDING_GENERATION },
      { name: QUEUES.FACT_EXTRACTION },
      { name: QUEUES.FILE_PROCESSING },
    ),
    MessagesModule,
    MemoriesModule,
    FactsModule,
    PeopleModule,
    FilesModule,
    IngestionModule,
    ContentProcessingModule,
  ],
  providers: [
    MemoryProcessingProcessor,
    EmbeddingProcessor,
    FactExtractionProcessor,
    FileProcessingProcessor,
  ],
})
export class JobsModule {}
```

---

## 22. Health Module

### Files

```
src/health/
├── health.module.ts
└── health.controller.ts
```

### `src/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  private redis: Redis;

  constructor(
    private dataSource: DataSource,
    private storageService: StorageService,
    private config: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
    });
  }

  @Get()
  async check() {
    const [postgres, redis, minio] = await Promise.allSettled([
      this.checkPostgres(),
      this.checkRedis(),
      this.storageService.isHealthy(),
    ]);

    const allHealthy =
      postgres.status === 'fulfilled' && postgres.value &&
      redis.status === 'fulfilled' && redis.value &&
      minio.status === 'fulfilled' && minio.value;

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        postgres: postgres.status === 'fulfilled' ? postgres.value : false,
        redis: redis.status === 'fulfilled' ? redis.value : false,
        minio: minio.status === 'fulfilled' ? minio.value : false,
      },
    };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}
```

### `src/health/health.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

---

## 23. Full Folder Tree

Complete listing of every file in the `api/src/` directory.

```
api/
├── .env.example
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
│
└── src/
    ├── main.ts
    ├── app.module.ts
    │
    ├── config/
    │   └── database.config.ts
    │
    ├── database/
    │   └── migrations/
    │       └── .gitkeep
    │
    ├── common/
    │   ├── decorators/
    │   │   └── current-user.decorator.ts
    │   ├── dto/
    │   │   └── pagination.dto.ts
    │   ├── filters/
    │   │   └── http-exception.filter.ts
    │   ├── guards/
    │   │   └── jwt-auth.guard.ts
    │   ├── interceptors/
    │   │   └── transform.interceptor.ts
    │   ├── pipes/
    │   │   └── .gitkeep
    │   ├── utils/
    │   │   └── chunk.util.ts
    │   └── types/
    │       └── index.ts
    │
    ├── auth/
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── strategies/
    │   │   └── jwt.strategy.ts
    │   └── dto/
    │       ├── register.dto.ts
    │       └── login.dto.ts
    │
    ├── users/
    │   ├── users.module.ts
    │   ├── users.service.ts
    │   └── entities/
    │       └── user.entity.ts
    │
    ├── conversations/
    │   ├── conversations.module.ts
    │   ├── conversations.controller.ts
    │   ├── conversations.service.ts
    │   ├── entities/
    │   │   └── conversation.entity.ts
    │   └── dto/
    │       └── create-conversation.dto.ts
    │
    ├── messages/
    │   ├── messages.module.ts
    │   ├── messages.service.ts
    │   └── entities/
    │       └── message.entity.ts
    │
    ├── chat/
    │   ├── chat.module.ts
    │   ├── chat.controller.ts
    │   ├── chat.service.ts
    │   └── dto/
    │       └── send-message.dto.ts
    │
    ├── memories/
    │   ├── memories.module.ts
    │   ├── memories.controller.ts
    │   ├── memories.service.ts
    │   ├── entities/
    │   │   ├── memory-item.entity.ts
    │   │   └── memory-chunk.entity.ts
    │   └── dto/
    │       └── search-memories.dto.ts
    │
    ├── retrieval/
    │   ├── retrieval.module.ts
    │   └── retrieval.service.ts
    │
    ├── facts/
    │   ├── facts.module.ts
    │   ├── facts.service.ts
    │   └── entities/
    │       └── user-fact.entity.ts
    │
    ├── people/
    │   ├── people.module.ts
    │   ├── people.service.ts
    │   └── entities/
    │       └── person.entity.ts
    │
    ├── ingestion/
    │   ├── ingestion.module.ts
    │   ├── ingestion.controller.ts
    │   ├── ingestion.service.ts
    │   ├── entities/
    │   │   └── ingested-item.entity.ts
    │   └── dto/
    │       ├── share-link.dto.ts
    │       ├── share-text.dto.ts
    │       ├── share-file-init.dto.ts
    │       └── share-file-complete.dto.ts
    │
    ├── content-processing/
    │   ├── content-processing.module.ts
    │   ├── content-processing.service.ts
    │   └── processors/
    │       ├── link.processor.ts
    │       ├── youtube.processor.ts
    │       ├── pdf.processor.ts
    │       ├── image.processor.ts
    │       └── text.processor.ts
    │
    ├── files/
    │   ├── files.module.ts
    │   ├── files.controller.ts
    │   ├── files.service.ts
    │   └── entities/
    │       └── file-object.entity.ts
    │
    ├── storage/
    │   ├── storage.module.ts
    │   └── storage.service.ts
    │
    ├── ai/
    │   ├── ai.module.ts
    │   ├── ai.service.ts
    │   ├── embedding.service.ts
    │   └── prompts/
    │       ├── chat-system.prompt.ts
    │       ├── fact-extraction.prompt.ts
    │       ├── summarization.prompt.ts
    │       └── memory-classification.prompt.ts
    │
    ├── jobs/
    │   ├── jobs.module.ts
    │   ├── queues/
    │   │   └── queue.constants.ts
    │   └── processors/
    │       ├── memory-processing.processor.ts
    │       ├── embedding.processor.ts
    │       ├── fact-extraction.processor.ts
    │       └── file-processing.processor.ts
    │
    └── health/
        ├── health.module.ts
        └── health.controller.ts
```

**Total files: 67** (including `.gitkeep` placeholders)

---

## Run Commands

```bash
# Start infrastructure
docker compose up -d

# Install API dependencies
cd api && npm install

# Copy env and configure
cp .env.example .env

# Start development server
npm run start:dev
```

The API will be available at `http://localhost:3000/api`.

---

## Related Docs

- [01 — API Architecture](./01-api-architecture.md) — High-level system architecture, database schema, and API endpoints
- [03 — Memory Strategy](./03-memory-strategy.md) — What to remember, importance scoring, decay, and privacy
- [04 — RAG Pipeline](./04-rag-pipeline.md) — Memory extraction, embedding, and retrieval implementation
- [05 — Ingestion Architecture](./05-ingestion-architecture.md) — Share-to-memory pipeline
- [06 — Mobile Architecture](./06-mobile-architecture.md) — Expo React Native client
