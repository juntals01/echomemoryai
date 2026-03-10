> Part of [FriendAI Architecture Documentation](./README.md)

# FriendAI Share-Ingestion Pipeline — Implementation Spec

Complete implementation specification for the mobile share-to-memory ingestion system. Allows the Expo app to send shared content (text, links, files) into the NestJS backend so FriendAI can remember it.

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Ingestion Flows](#2-ingestion-flows)
3. [Database Entities](#3-database-entities)
4. [API DTOs](#4-api-dtos)
5. [Ingestion Module](#5-ingestion-module)
6. [Link Processing Service](#6-link-processing-service)
7. [Text Share Processing Service](#7-text-share-processing-service)
8. [File Processing Service](#8-file-processing-service)
9. [MinIO Storage Integration](#9-minio-storage-integration)
10. [BullMQ Queues and Processors](#10-bullmq-queues-and-processors)
11. [Memory Integration](#11-memory-integration)
12. [Module Wiring](#12-module-wiring)
13. [Full Folder Tree](#13-full-folder-tree)

---

## 1. Pipeline Overview

The mobile app shares content via the native share sheet. The API receives it, stores a record, and processes it asynchronously to turn it into searchable memory.

```
┌────────────────────────────────────────────────────────────┐
│                    Expo Mobile App                          │
│                                                            │
│  Share Sheet → Detect Content Type → Call API               │
│                                                            │
│  Text    → POST /ingestion/share-text                      │
│  Link    → POST /ingestion/share-link                      │
│  File    → POST /ingestion/share-file/init                 │
│           → PUT  {uploadUrl}  (direct to MinIO)            │
│           → POST /ingestion/share-file/complete            │
└─────────────────────────┬──────────────────────────────────┘
                          │ HTTPS
                          ▼
┌────────────────────────────────────────────────────────────┐
│                    NestJS API                              │
│                                                            │
│  IngestionController                                       │
│    ├── shareLink()   → IngestedItem + enqueue job          │
│    ├── shareText()   → IngestedItem + enqueue job          │
│    ├── shareFileInit()    → FileObject + signed URL        │
│    └── shareFileComplete() → IngestedItem + enqueue job    │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              BullMQ Job Queues (Redis)               │  │
│  │                                                      │  │
│  │  link-processing  text-processing  file-processing   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                 │
│             ┌────────────┼────────────┐                    │
│             ▼            ▼            ▼                    │
│  LinkProcessing   TextProcessing   FileProcessing          │
│  Processor        Processor        Processor               │
│    │                │                │                      │
│    ▼                ▼                ▼                      │
│  MemoryItem + MemoryChunks + Embeddings                    │
└────────────────────────────────────────────────────────────┘
```

### Content Type Detection

| Shared Content | Detection | Endpoint | Source Type |
|---|---|---|---|
| Website link | URL string | `/share-link` | `link` |
| YouTube link | `youtube.com` or `youtu.be` in URL | `/share-link` | `youtube` |
| Plain text / note | Text string | `/share-text` | `text_share` |
| PDF file | MIME `application/pdf` | `/share-file/*` | `pdf` |
| Image file | MIME `image/*` | `/share-file/*` | `image` |
| Other file | Any other MIME | `/share-file/*` | `file_upload` |

---

## 2. Ingestion Flows

### Flow A: Share Link

```
POST /api/ingestion/share-link
{ "url": "https://example.com/article", "note": "Remember this" }
  │
  ├── Validate JWT auth
  ├── Detect link type (generic | youtube | direct PDF)
  ├── Normalize URL
  ├── Create IngestedItem (status: pending)
  ├── Enqueue link-processing job
  └── Return { success: true, itemId, status: "processing" }
        │
        └── [BullMQ: link-processing]
              ├── Mark status → processing
              ├── Classify URL type
              ├── Extract basic metadata (hostname, title placeholder)
              ├── Store metadata in IngestedItem
              ├── Create MemoryItem from metadata + note
              ├── Enqueue embedding-generation
              └── Mark status → completed
```

### Flow B: Share Text

```
POST /api/ingestion/share-text
{ "text": "Important idea about...", "note": "save this", "sourceUrl": "https://..." }
  │
  ├── Validate JWT auth
  ├── Create IngestedItem (status: pending, rawText saved)
  ├── Enqueue text-processing job
  └── Return { success: true, itemId, status: "processing" }
        │
        └── [BullMQ: text-processing]
              ├── Mark status → processing
              ├── AIService.summarize(text)
              ├── Create MemoryItem (summary, importance)
              ├── Enqueue embedding-generation
              ├── Enqueue fact-extraction (if text seems factual)
              └── Mark status → completed
```

### Flow C: Share File (Two-Step Upload)

```
POST /api/ingestion/share-file/init
{ "fileName": "contract.pdf", "mimeType": "application/pdf", "size": 204800 }
  │
  ├── Validate JWT auth
  ├── Map MIME type → bucket (user-attachments)
  ├── Build object key: user/{userId}/uploads/{uuid}-contract.pdf
  ├── Create FileObject (uploadStatus: initiated)
  ├── Generate MinIO presigned PUT URL (15 min expiry)
  └── Return { fileId, bucket, objectKey, uploadUrl }

Mobile app PUTs file bytes directly to MinIO via uploadUrl
  │
  ▼

POST /api/ingestion/share-file/complete
{ "fileId": "uuid", "note": "remember this contract" }
  │
  ├── Validate JWT auth
  ├── Verify file ownership
  ├── Mark FileObject uploadStatus → uploaded
  ├── Detect source type from MIME (pdf | image | file_upload)
  ├── Create IngestedItem (status: pending, linked to fileId)
  ├── Enqueue file-processing job
  └── Return { success: true, itemId, status: "processing" }
        │
        └── [BullMQ: file-processing]
              ├── Mark status → processing
              ├── Load FileObject metadata
              ├── Route by MIME type:
              │   ├── PDF → placeholder for pdf-parse extraction
              │   ├── Image → placeholder for OCR/vision pipeline
              │   └── Other → store as-is with metadata
              ├── Create MemoryItem from note + file metadata
              ├── Enqueue embedding-generation
              └── Mark status → completed
```

---

## 3. Database Entities

### `IngestedItem` Entity

File: `src/ingestion/entities/ingested-item.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { FileObject } from '../../files/entities/file-object.entity';

export enum IngestionSourceType {
  LINK = 'link',
  YOUTUBE = 'youtube',
  TEXT_SHARE = 'text_share',
  PDF = 'pdf',
  IMAGE = 'image',
  FILE_UPLOAD = 'file_upload',
}

export enum IngestionStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('ingested_items')
@Index(['userId', 'status'])
@Index(['userId', 'sourceType'])
export class IngestedItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: IngestionSourceType })
  sourceType: IngestionSourceType;

  @Column({ type: 'enum', enum: IngestionStatus, default: IngestionStatus.PENDING })
  status: IngestionStatus;

  @Column({ type: 'text', nullable: true })
  url: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  rawText: string;

  @Column({ type: 'uuid', nullable: true })
  fileId: string;

  @ManyToOne(() => FileObject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fileId' })
  file: FileObject;

  @Column({ type: 'jsonb', nullable: true })
  metadataJson: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### `FileObject` Entity

File: `src/files/entities/file-object.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UploadStatus {
  INITIATED = 'initiated',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('files')
@Index(['userId', 'uploadStatus'])
export class FileObject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  bucket: string;

  @Column()
  objectKey: string;

  @Column()
  originalName: string;

  @Column()
  mimeType: string;

  @Column({ type: 'bigint' })
  size: number;

  @Column({ type: 'enum', enum: UploadStatus, default: UploadStatus.INITIATED })
  uploadStatus: UploadStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Enum Summary

**`IngestionSourceType`**:

| Value | When |
|---|---|
| `link` | Generic website URL |
| `youtube` | YouTube URL detected |
| `text_share` | Plain text shared from any app |
| `pdf` | PDF file uploaded |
| `image` | Image file uploaded |
| `file_upload` | Any other file type |

**`IngestionStatus`**:

| Value | Meaning |
|---|---|
| `pending` | Record created, job not yet started |
| `uploaded` | File uploaded to MinIO (file flow only) |
| `processing` | Background job picked it up |
| `completed` | Processing finished, memory created |
| `failed` | Processing failed after retries |

**`UploadStatus`**:

| Value | Meaning |
|---|---|
| `initiated` | Presigned URL generated, file not yet uploaded |
| `uploaded` | Mobile confirmed upload to MinIO |
| `processing` | File is being processed by a worker |
| `processed` | Processing complete |
| `failed` | Processing failed |

---

## 4. API DTOs

### `src/ingestion/dto/share-link.dto.ts`

```typescript
import { IsUrl, IsOptional, IsString, MaxLength } from 'class-validator';

export class ShareLinkDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

### `src/ingestion/dto/share-text.dto.ts`

```typescript
import { IsString, IsOptional, MinLength, MaxLength, IsUrl } from 'class-validator';

export class ShareTextDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}
```

### `src/ingestion/dto/share-file-init.dto.ts`

```typescript
import { IsString, IsInt, Min, Max } from 'class-validator';

export class ShareFileInitDto {
  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(104857600) // 100 MB
  size: number;
}
```

### `src/ingestion/dto/share-file-complete.dto.ts`

```typescript
import { IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';

export class ShareFileCompleteDto {
  @IsUUID()
  fileId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

---

## 5. Ingestion Module

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
    return this.ingestionService.shareFileComplete(user.id, dto);
  }
}
```

### `src/ingestion/ingestion.service.ts`

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  IngestedItem,
  IngestionSourceType,
  IngestionStatus,
} from './entities/ingested-item.entity';
import { FileObject, UploadStatus } from '../files/entities/file-object.entity';
import { StorageService } from '../storage/storage.service';
import { LinkProcessingService } from './services/link-processing.service';
import { ShareLinkDto } from './dto/share-link.dto';
import { ShareTextDto } from './dto/share-text.dto';
import { ShareFileInitDto } from './dto/share-file-init.dto';
import { ShareFileCompleteDto } from './dto/share-file-complete.dto';
import { INGESTION_QUEUES } from './queues/ingestion-queue.constants';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(IngestedItem)
    private ingestedRepo: Repository<IngestedItem>,
    @InjectRepository(FileObject)
    private filesRepo: Repository<FileObject>,
    private storageService: StorageService,
    private linkProcessingService: LinkProcessingService,
    @InjectQueue(INGESTION_QUEUES.LINK_PROCESSING) private linkQueue: Queue,
    @InjectQueue(INGESTION_QUEUES.TEXT_PROCESSING) private textQueue: Queue,
    @InjectQueue(INGESTION_QUEUES.FILE_PROCESSING) private fileQueue: Queue,
  ) {}

  // ---- A. Share Link ----

  async shareLink(userId: string, dto: ShareLinkDto) {
    const normalizedUrl = this.linkProcessingService.normalizeUrl(dto.url);
    const linkType = this.linkProcessingService.detectLinkType(normalizedUrl);

    const item = this.ingestedRepo.create({
      userId,
      sourceType: linkType,
      status: IngestionStatus.PENDING,
      url: normalizedUrl,
      note: dto.note,
      metadataJson: {
        originalUrl: dto.url,
        detectedType: linkType,
      },
    });
    const saved = await this.ingestedRepo.save(item);

    await this.linkQueue.add(
      'process-link',
      {
        ingestedItemId: saved.id,
        userId,
        url: normalizedUrl,
        linkType,
        note: dto.note,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
      },
    );

    this.logger.log(`Shared link queued: ${normalizedUrl} [${linkType}]`);

    return {
      success: true,
      message: 'Saved to FriendAI',
      itemId: saved.id,
      status: 'processing',
    };
  }

  // ---- B. Share Text ----

  async shareText(userId: string, dto: ShareTextDto) {
    const item = this.ingestedRepo.create({
      userId,
      sourceType: IngestionSourceType.TEXT_SHARE,
      status: IngestionStatus.PENDING,
      rawText: dto.text,
      note: dto.note,
      url: dto.sourceUrl,
      metadataJson: {
        charCount: dto.text.length,
        sourceUrl: dto.sourceUrl,
      },
    });
    const saved = await this.ingestedRepo.save(item);

    await this.textQueue.add(
      'process-text',
      {
        ingestedItemId: saved.id,
        userId,
        text: dto.text,
        note: dto.note,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
      },
    );

    this.logger.log(`Shared text queued (${dto.text.length} chars)`);

    return {
      success: true,
      message: 'Saved to FriendAI',
      itemId: saved.id,
      status: 'processing',
    };
  }

  // ---- C. Share File Init ----

  async shareFileInit(userId: string, dto: ShareFileInitDto) {
    const bucket = this.mapMimeToBucket(dto.mimeType);
    const sanitized = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `user/${userId}/uploads/${uuidv4()}-${sanitized}`;

    const file = this.filesRepo.create({
      userId,
      bucket,
      objectKey,
      originalName: dto.fileName,
      mimeType: dto.mimeType,
      size: dto.size,
      uploadStatus: UploadStatus.INITIATED,
    });
    const saved = await this.filesRepo.save(file);

    const uploadUrl = await this.storageService.generateUploadUrl(
      bucket,
      objectKey,
      dto.mimeType,
    );

    this.logger.log(`File upload initiated: ${dto.fileName} → ${bucket}/${objectKey}`);

    return {
      success: true,
      fileId: saved.id,
      bucket,
      objectKey,
      uploadUrl,
    };
  }

  // ---- D. Share File Complete ----

  async shareFileComplete(userId: string, dto: ShareFileCompleteDto) {
    const file = await this.filesRepo.findOne({
      where: { id: dto.fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.userId !== userId) {
      throw new ForbiddenException('Not your file');
    }
    if (file.uploadStatus !== UploadStatus.INITIATED) {
      throw new ForbiddenException('File already processed');
    }

    // Mark uploaded
    file.uploadStatus = UploadStatus.UPLOADED;
    await this.filesRepo.save(file);

    // Determine source type from MIME
    const sourceType = this.mapMimeToSourceType(file.mimeType);

    // Create IngestedItem linked to this file
    const item = this.ingestedRepo.create({
      userId,
      sourceType,
      status: IngestionStatus.PENDING,
      fileId: file.id,
      note: dto.note,
      title: file.originalName,
      metadataJson: {
        fileName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        bucket: file.bucket,
        objectKey: file.objectKey,
      },
    });
    const saved = await this.ingestedRepo.save(item);

    await this.fileQueue.add(
      'process-file',
      {
        ingestedItemId: saved.id,
        fileId: file.id,
        userId,
        note: dto.note,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
      },
    );

    this.logger.log(`File upload completed: ${file.originalName} [${sourceType}]`);

    return {
      success: true,
      message: 'Saved to FriendAI',
      itemId: saved.id,
      status: 'processing',
    };
  }

  // ---- Status Update Helper ----

  async updateStatus(
    id: string,
    status: IngestionStatus,
    updates?: Partial<IngestedItem>,
  ): Promise<void> {
    await this.ingestedRepo.update(id, { status, ...updates });
  }

  // ---- Private Helpers ----

  private mapMimeToBucket(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'user-images';
    if (mimeType.startsWith('audio/')) return 'user-audio';
    return 'user-attachments';
  }

  private mapMimeToSourceType(mimeType: string): IngestionSourceType {
    if (mimeType === 'application/pdf') return IngestionSourceType.PDF;
    if (mimeType.startsWith('image/')) return IngestionSourceType.IMAGE;
    return IngestionSourceType.FILE_UPLOAD;
  }
}
```

### `src/ingestion/ingestion.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestedItem } from './entities/ingested-item.entity';
import { FileObject } from '../files/entities/file-object.entity';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { LinkProcessingService } from './services/link-processing.service';
import { TextShareProcessingService } from './services/text-share-processing.service';
import { FileProcessingService } from './services/file-processing.service';
import { StorageModule } from '../storage/storage.module';
import { MemoriesModule } from '../memories/memories.module';
import { AiModule } from '../ai/ai.module';
import { INGESTION_QUEUES } from './queues/ingestion-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([IngestedItem, FileObject]),
    BullModule.registerQueue(
      { name: INGESTION_QUEUES.LINK_PROCESSING },
      { name: INGESTION_QUEUES.TEXT_PROCESSING },
      { name: INGESTION_QUEUES.FILE_PROCESSING },
    ),
    StorageModule,
    MemoriesModule,
    AiModule,
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    LinkProcessingService,
    TextShareProcessingService,
    FileProcessingService,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
```

---

## 6. Link Processing Service

### `src/ingestion/services/link-processing.service.ts`

Responsible for URL classification, normalization, and basic metadata extraction. Full scraping (readability, YouTube transcript) is deferred to later phases.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IngestionSourceType } from '../entities/ingested-item.entity';

export interface LinkMetadata {
  normalizedUrl: string;
  hostname: string;
  linkType: IngestionSourceType;
  title: string;
  description: string | null;
  isYouTube: boolean;
  youTubeVideoId: string | null;
  isPdfLink: boolean;
}

@Injectable()
export class LinkProcessingService {
  private readonly logger = new Logger(LinkProcessingService.name);

  /**
   * Detect link type from URL.
   *
   * - youtube.com / youtu.be → YOUTUBE
   * - URL ending in .pdf → PDF
   * - Everything else → LINK
   */
  detectLinkType(url: string): IngestionSourceType {
    const lower = url.toLowerCase();

    if (this.isYouTubeUrl(lower)) {
      return IngestionSourceType.YOUTUBE;
    }

    if (lower.endsWith('.pdf') || lower.includes('.pdf?')) {
      return IngestionSourceType.PDF;
    }

    return IngestionSourceType.LINK;
  }

  /**
   * Normalize a URL:
   * - ensure protocol
   * - remove trailing slashes
   * - remove tracking parameters (utm_*)
   */
  normalizeUrl(url: string): string {
    let normalized = url.trim();

    // Add protocol if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }

    try {
      const parsed = new URL(normalized);

      // Remove tracking params
      const trackingPrefixes = ['utm_', 'fbclid', 'gclid', 'ref', 'source'];
      for (const key of [...parsed.searchParams.keys()]) {
        if (trackingPrefixes.some((p) => key.startsWith(p))) {
          parsed.searchParams.delete(key);
        }
      }

      // Remove trailing slash from pathname
      if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.toString();
    } catch {
      return normalized;
    }
  }

  /**
   * Extract basic metadata from a URL without fetching.
   * Full scraping is a separate phase — this provides a placeholder structure.
   */
  extractBasicMetadata(url: string): LinkMetadata {
    const normalizedUrl = this.normalizeUrl(url);
    let hostname = '';

    try {
      hostname = new URL(normalizedUrl).hostname.replace('www.', '');
    } catch {
      hostname = 'unknown';
    }

    const linkType = this.detectLinkType(normalizedUrl);
    const isYouTube = linkType === IngestionSourceType.YOUTUBE;
    const youTubeVideoId = isYouTube ? this.extractYouTubeId(normalizedUrl) : null;
    const isPdfLink = linkType === IngestionSourceType.PDF;

    const title = isYouTube
      ? `YouTube video (${youTubeVideoId})`
      : `Content from ${hostname}`;

    return {
      normalizedUrl,
      hostname,
      linkType,
      title,
      description: null,
      isYouTube,
      youTubeVideoId,
      isPdfLink,
    };
  }

  // ---- Private ----

  private isYouTubeUrl(url: string): boolean {
    return (
      url.includes('youtube.com/watch') ||
      url.includes('youtube.com/shorts') ||
      url.includes('youtu.be/') ||
      url.includes('youtube.com/embed/')
    );
  }

  private extractYouTubeId(url: string): string | null {
    try {
      const parsed = new URL(url);

      // youtube.com/watch?v=ID
      if (parsed.hostname.includes('youtube.com')) {
        return parsed.searchParams.get('v');
      }

      // youtu.be/ID
      if (parsed.hostname === 'youtu.be') {
        return parsed.pathname.slice(1).split('/')[0] || null;
      }
    } catch {
      // fall through
    }
    return null;
  }
}
```

---

## 7. Text Share Processing Service

### `src/ingestion/services/text-share-processing.service.ts`

Processes shared text: summarizes via AI, creates a MemoryItem, and enqueues embedding + fact extraction.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MemoriesService } from '../../memories/memories.service';
import { AiService } from '../../ai/ai.service';
import { SourceType, MemoryType } from '../../memories/entities/memory-item.entity';
import { QUEUES } from '../../jobs/queues/queue.constants';

@Injectable()
export class TextShareProcessingService {
  private readonly logger = new Logger(TextShareProcessingService.name);

  constructor(
    private memoriesService: MemoriesService,
    private aiService: AiService,
    @InjectQueue(QUEUES.EMBEDDING_GENERATION) private embeddingQueue: Queue,
    @InjectQueue(QUEUES.FACT_EXTRACTION) private factQueue: Queue,
  ) {}

  /**
   * Process shared text into a searchable memory.
   *
   * 1. Summarize the text via AI
   * 2. Create a MemoryItem
   * 3. Enqueue embedding generation
   * 4. Enqueue fact extraction if the text is short enough to contain personal facts
   */
  async processText(
    ingestedItemId: string,
    userId: string,
    text: string,
    note?: string,
  ): Promise<string> {
    // Step 1: Summarize
    const summary = await this.aiService.summarize(text);

    // Determine importance: longer text with a note = more important
    const importance = this.estimateImportance(text, note);

    // Step 2: Create MemoryItem
    const title = note || text.slice(0, 100).replace(/\n/g, ' ');
    const memory = await this.memoriesService.createMemory({
      userId,
      sourceType: SourceType.INGESTION,
      sourceId: ingestedItemId,
      title,
      summary,
      importance,
      memoryType: MemoryType.SEMANTIC,
      tags: [],
      rawContent: text,
    });

    this.logger.log(`Created memory ${memory.id} from shared text`);

    // Step 3: Enqueue embedding
    await this.embeddingQueue.add(
      'generate-embedding',
      { memoryItemId: memory.id, text: summary, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    // Step 4: Enqueue fact extraction for shorter texts that likely contain personal info
    if (text.length < 2000) {
      await this.factQueue.add(
        'extract-facts',
        {
          memoryItemId: memory.id,
          text,
          userId,
          sourceMessageId: null,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    }

    return memory.id;
  }

  private estimateImportance(text: string, note?: string): number {
    let score = 0.4;
    if (note && note.length > 0) score += 0.2;  // user annotated = more important
    if (text.length > 500) score += 0.1;         // longer = more substantial
    return Math.min(score, 1.0);
  }
}
```

---

## 8. File Processing Service

### `src/ingestion/services/file-processing.service.ts`

Handles uploaded files. Routes by MIME type, creates placeholder processing records, and produces MemoryItems from metadata.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { FileObject, UploadStatus } from '../../files/entities/file-object.entity';
import { MemoriesService } from '../../memories/memories.service';
import { StorageService } from '../../storage/storage.service';
import { SourceType, MemoryType } from '../../memories/entities/memory-item.entity';
import { QUEUES } from '../../jobs/queues/queue.constants';

export interface FileProcessingResult {
  memoryId: string;
  extractedText: string | null;
  processingNotes: string;
}

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);

  constructor(
    @InjectRepository(FileObject)
    private filesRepo: Repository<FileObject>,
    private memoriesService: MemoriesService,
    private storageService: StorageService,
    @InjectQueue(QUEUES.EMBEDDING_GENERATION) private embeddingQueue: Queue,
  ) {}

  /**
   * Process an uploaded file based on its MIME type.
   * Creates a MemoryItem from whatever metadata and notes are available.
   *
   * Full content extraction (PDF parsing, OCR) is deferred to future phases.
   * This creates the correct architecture and queue flow so it's easy to extend.
   */
  async processFile(
    ingestedItemId: string,
    fileId: string,
    userId: string,
    note?: string,
  ): Promise<FileProcessingResult> {
    const file = await this.filesRepo.findOne({ where: { id: fileId } });
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Mark file as processing
    file.uploadStatus = UploadStatus.PROCESSING;
    await this.filesRepo.save(file);

    let result: FileProcessingResult;

    try {
      if (file.mimeType === 'application/pdf') {
        result = await this.processPdf(ingestedItemId, file, userId, note);
      } else if (file.mimeType.startsWith('image/')) {
        result = await this.processImage(ingestedItemId, file, userId, note);
      } else {
        result = await this.processGenericFile(ingestedItemId, file, userId, note);
      }

      file.uploadStatus = UploadStatus.PROCESSED;
      await this.filesRepo.save(file);

      return result;
    } catch (error) {
      file.uploadStatus = UploadStatus.FAILED;
      await this.filesRepo.save(file);
      throw error;
    }
  }

  // ---- PDF ----

  private async processPdf(
    ingestedItemId: string,
    file: FileObject,
    userId: string,
    note?: string,
  ): Promise<FileProcessingResult> {
    this.logger.log(`Processing PDF: ${file.originalName}`);

    // TODO: Implement with pdf-parse library
    // const buffer = await this.storageService.download(file.bucket, file.objectKey);
    // const pdfData = await pdfParse(buffer);
    // const extractedText = pdfData.text;

    const processingNotes = 'PDF received. Full text extraction pipeline pending.';
    const memoryText = note
      ? `${note}\n\n[PDF: ${file.originalName}]`
      : `Uploaded PDF: ${file.originalName}`;

    const memory = await this.memoriesService.createMemory({
      userId,
      sourceType: SourceType.INGESTION,
      sourceId: ingestedItemId,
      title: `PDF: ${file.originalName}`,
      summary: memoryText,
      importance: note ? 0.6 : 0.4,
      memoryType: MemoryType.SEMANTIC,
      tags: ['pdf', 'document'],
      rawContent: memoryText,
    });

    await this.enqueueEmbedding(memory.id, memoryText, userId);

    return {
      memoryId: memory.id,
      extractedText: null,
      processingNotes,
    };
  }

  // ---- Image ----

  private async processImage(
    ingestedItemId: string,
    file: FileObject,
    userId: string,
    note?: string,
  ): Promise<FileProcessingResult> {
    this.logger.log(`Processing image: ${file.originalName}`);

    // TODO: Implement with vision LLM or OCR service
    // const buffer = await this.storageService.download(file.bucket, file.objectKey);
    // const description = await this.aiService.describeImage(buffer);

    const processingNotes = 'Image received. Vision/OCR pipeline pending.';
    const memoryText = note
      ? `${note}\n\n[Image: ${file.originalName}]`
      : `Uploaded image: ${file.originalName}`;

    const memory = await this.memoriesService.createMemory({
      userId,
      sourceType: SourceType.INGESTION,
      sourceId: ingestedItemId,
      title: `Image: ${file.originalName}`,
      summary: memoryText,
      importance: note ? 0.5 : 0.3,
      memoryType: MemoryType.EPISODIC,
      tags: ['image'],
      rawContent: memoryText,
    });

    await this.enqueueEmbedding(memory.id, memoryText, userId);

    return {
      memoryId: memory.id,
      extractedText: null,
      processingNotes,
    };
  }

  // ---- Generic File ----

  private async processGenericFile(
    ingestedItemId: string,
    file: FileObject,
    userId: string,
    note?: string,
  ): Promise<FileProcessingResult> {
    this.logger.log(`Processing generic file: ${file.originalName}`);

    const memoryText = note
      ? `${note}\n\n[File: ${file.originalName}, ${file.mimeType}]`
      : `Uploaded file: ${file.originalName} (${file.mimeType})`;

    const memory = await this.memoriesService.createMemory({
      userId,
      sourceType: SourceType.INGESTION,
      sourceId: ingestedItemId,
      title: `File: ${file.originalName}`,
      summary: memoryText,
      importance: note ? 0.4 : 0.2,
      memoryType: MemoryType.SEMANTIC,
      tags: ['file', file.mimeType.split('/')[1] || 'unknown'],
      rawContent: memoryText,
    });

    await this.enqueueEmbedding(memory.id, memoryText, userId);

    return {
      memoryId: memory.id,
      extractedText: null,
      processingNotes: 'File stored. Content extraction not available for this type.',
    };
  }

  // ---- Helper ----

  private async enqueueEmbedding(
    memoryItemId: string,
    text: string,
    userId: string,
  ): Promise<void> {
    await this.embeddingQueue.add(
      'generate-embedding',
      { memoryItemId, text, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
  }
}
```

---

## 9. MinIO Storage Integration

### `src/storage/storage.service.ts`

Updated to support the ingestion pipeline's upload/download flows with user-scoped object keys.

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

const BUCKETS = [
  'user-audio',
  'user-images',
  'user-attachments',
  'user-exports',
];

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

  /** Create all required buckets on startup. */
  async onModuleInit() {
    for (const bucket of BUCKETS) {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket);
        this.logger.log(`Created bucket: ${bucket}`);
      }
    }
  }

  /**
   * Generate a presigned PUT URL for direct upload from mobile.
   *
   * @param bucket - target bucket (e.g. 'user-images')
   * @param objectKey - full object key (e.g. 'user/{userId}/uploads/{uuid}-photo.jpg')
   * @param contentType - MIME type for Content-Type header
   * @param expirySeconds - URL expiry (default 15 minutes)
   */
  async generateUploadUrl(
    bucket: string,
    objectKey: string,
    contentType: string,
    expirySeconds = 900,
  ): Promise<string> {
    return this.client.presignedPutObject(bucket, objectKey, expirySeconds);
  }

  /**
   * Generate a presigned GET URL for file download.
   *
   * @param bucket - source bucket
   * @param objectKey - full object key
   * @param expirySeconds - URL expiry (default 1 hour)
   */
  async generateDownloadUrl(
    bucket: string,
    objectKey: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, objectKey, expirySeconds);
  }

  /** Download a file from MinIO as a Buffer. Used by processing workers. */
  async download(bucket: string, objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /** Upload a buffer directly to MinIO. */
  async upload(
    bucket: string,
    objectKey: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.putObject(bucket, objectKey, data, undefined, metadata);
  }

  /** Delete a file from MinIO. */
  async delete(bucket: string, objectKey: string): Promise<void> {
    await this.client.removeObject(bucket, objectKey);
  }

  /** Check connectivity for health checks. */
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

### Object Key Format

```
user/{userId}/uploads/{uuid}-{sanitizedFileName}
```

Examples:

```
user/550e8400-e29b-41d4-a716-446655440000/uploads/a1b2c3d4-resume.pdf
user/550e8400-e29b-41d4-a716-446655440000/uploads/e5f6g7h8-photo.jpg
user/550e8400-e29b-41d4-a716-446655440000/uploads/i9j0k1l2-recording.m4a
```

### Bucket Mapping

| MIME Type Pattern | Bucket | Examples |
|---|---|---|
| `image/*` | `user-images` | .jpg, .png, .webp, .heic |
| `audio/*` | `user-audio` | .mp3, .m4a, .wav |
| Everything else | `user-attachments` | .pdf, .docx, .txt, .zip |

`user-exports` is reserved for system-generated exports (memory dumps, conversation exports). Not used by ingestion.

---

## 10. BullMQ Queues and Processors

### Queue Constants

File: `src/ingestion/queues/ingestion-queue.constants.ts`

```typescript
export const INGESTION_QUEUES = {
  LINK_PROCESSING: 'link-processing',
  TEXT_PROCESSING: 'text-processing',
  FILE_PROCESSING: 'file-processing',
} as const;
```

These are separate from the core memory queues (`memory-processing`, `embedding-generation`, `fact-extraction`) defined in `src/jobs/queues/queue.constants.ts`. The ingestion processors call into those queues when they create MemoryItems.

### Processor 1: `src/ingestion/processors/link-processing.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { INGESTION_QUEUES } from '../queues/ingestion-queue.constants';
import { IngestionService } from '../ingestion.service';
import { LinkProcessingService } from '../services/link-processing.service';
import { MemoriesService } from '../../memories/memories.service';
import { IngestionStatus } from '../entities/ingested-item.entity';
import { SourceType, MemoryType } from '../../memories/entities/memory-item.entity';
import { QUEUES } from '../../jobs/queues/queue.constants';

@Processor(INGESTION_QUEUES.LINK_PROCESSING)
export class LinkProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(LinkProcessingProcessor.name);

  constructor(
    private ingestionService: IngestionService,
    private linkProcessingService: LinkProcessingService,
    private memoriesService: MemoriesService,
    @InjectQueue(QUEUES.EMBEDDING_GENERATION) private embeddingQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { ingestedItemId, userId, url, linkType, note } = job.data;
    this.logger.log(`[Job ${job.id}] Processing link: ${url}`);

    try {
      // Mark as processing
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.PROCESSING,
      );

      // Extract metadata
      const metadata = this.linkProcessingService.extractBasicMetadata(url);

      // Build memory text
      const memoryParts: string[] = [];
      if (note) memoryParts.push(note);
      memoryParts.push(`Source: ${metadata.normalizedUrl}`);
      memoryParts.push(`Site: ${metadata.hostname}`);
      if (metadata.isYouTube && metadata.youTubeVideoId) {
        memoryParts.push(`YouTube video ID: ${metadata.youTubeVideoId}`);
      }
      const memoryText = memoryParts.join('\n');

      // Create MemoryItem
      const memory = await this.memoriesService.createMemory({
        userId,
        sourceType: SourceType.INGESTION,
        sourceId: ingestedItemId,
        title: metadata.title,
        summary: memoryText,
        importance: note ? 0.5 : 0.3,
        memoryType: MemoryType.SEMANTIC,
        tags: [metadata.hostname, linkType],
        rawContent: memoryText,
      });

      // Enqueue embedding
      await this.embeddingQueue.add(
        'generate-embedding',
        { memoryItemId: memory.id, text: memoryText, userId },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );

      // Mark as completed
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.COMPLETED,
        {
          title: metadata.title,
          description: metadata.description,
          metadataJson: metadata,
        },
      );

      this.logger.log(`[Job ${job.id}] Link processing complete: ${metadata.title}`);
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Link processing failed: ${error.message}`);
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.FAILED,
        { metadataJson: { error: error.message } },
      );
      throw error;
    }
  }
}
```

### Processor 2: `src/ingestion/processors/text-processing.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { INGESTION_QUEUES } from '../queues/ingestion-queue.constants';
import { IngestionService } from '../ingestion.service';
import { TextShareProcessingService } from '../services/text-share-processing.service';
import { IngestionStatus } from '../entities/ingested-item.entity';

@Processor(INGESTION_QUEUES.TEXT_PROCESSING)
export class TextProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(TextProcessingProcessor.name);

  constructor(
    private ingestionService: IngestionService,
    private textProcessingService: TextShareProcessingService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { ingestedItemId, userId, text, note } = job.data;
    this.logger.log(`[Job ${job.id}] Processing shared text (${text.length} chars)`);

    try {
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.PROCESSING,
      );

      const memoryId = await this.textProcessingService.processText(
        ingestedItemId,
        userId,
        text,
        note,
      );

      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.COMPLETED,
        {
          title: note || text.slice(0, 100),
          metadataJson: { memoryId, charCount: text.length },
        },
      );

      this.logger.log(`[Job ${job.id}] Text processing complete → memory ${memoryId}`);
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Text processing failed: ${error.message}`);
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.FAILED,
        { metadataJson: { error: error.message } },
      );
      throw error;
    }
  }
}
```

### Processor 3: `src/ingestion/processors/file-processing.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { INGESTION_QUEUES } from '../queues/ingestion-queue.constants';
import { IngestionService } from '../ingestion.service';
import { FileProcessingService } from '../services/file-processing.service';
import { IngestionStatus } from '../entities/ingested-item.entity';

@Processor(INGESTION_QUEUES.FILE_PROCESSING)
export class FileProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessingProcessor.name);

  constructor(
    private ingestionService: IngestionService,
    private fileProcessingService: FileProcessingService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { ingestedItemId, fileId, userId, note } = job.data;
    this.logger.log(`[Job ${job.id}] Processing uploaded file: ${fileId}`);

    try {
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.PROCESSING,
      );

      const result = await this.fileProcessingService.processFile(
        ingestedItemId,
        fileId,
        userId,
        note,
      );

      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.COMPLETED,
        {
          metadataJson: {
            memoryId: result.memoryId,
            processingNotes: result.processingNotes,
            hasExtractedText: result.extractedText !== null,
          },
        },
      );

      this.logger.log(
        `[Job ${job.id}] File processing complete → memory ${result.memoryId}`,
      );
    } catch (error) {
      this.logger.error(`[Job ${job.id}] File processing failed: ${error.message}`);
      await this.ingestionService.updateStatus(
        ingestedItemId,
        IngestionStatus.FAILED,
        { metadataJson: { error: error.message } },
      );
      throw error;
    }
  }
}
```

### Queue Concurrency

| Queue | Concurrency | Rationale |
|---|---|---|
| `link-processing` | 5 | URL metadata extraction is lightweight |
| `text-processing` | 5 | Each job calls AI summarize + enqueues follow-up |
| `file-processing` | 3 | File downloads + processing are heavier |

---

## 11. Memory Integration

When ingested content is processed, a MemoryItem is created and linked back via `sourceId`.

### MemoryItem Fields for Ingested Content

```typescript
{
  userId: string,
  sourceType: 'ingestion',
  sourceId: ingestedItemId,     // FK to ingested_items.id
  title: string,                // e.g. "PDF: contract.pdf" or user's note
  summary: string,              // AI-generated summary or constructed text
  importance: number,           // 0.0–1.0 based on content type + user annotation
  memoryType: 'semantic',       // ingested content is semantic knowledge
  tags: string[],               // e.g. ['pdf', 'document'] or ['youtube.com', 'youtube']
  rawContent: string,           // full text for chunking
}
```

### Importance Scoring for Ingested Content

| Content | Base Score | With Note | Reasoning |
|---|---|---|---|
| Plain text | 0.4 | 0.6 | User explicitly shared it |
| Long text (>500 chars) | 0.5 | 0.7 | Substantial content |
| Link | 0.3 | 0.5 | Just a URL, content unknown |
| YouTube | 0.3 | 0.5 | Video link, transcript pending |
| PDF | 0.4 | 0.6 | Document, likely important |
| Image | 0.3 | 0.5 | Visual, description pending |
| Generic file | 0.2 | 0.4 | Least context available |

Adding a `note` always bumps importance by +0.2 because the user took the effort to annotate it.

### Downstream Queue Flow

After a MemoryItem is created by any ingestion processor:

```
MemoryItem created
  │
  ├── Enqueue: embedding-generation
  │     └── Chunks text → generates embeddings → stores in memory_chunks
  │
  └── [Text processing only] Enqueue: fact-extraction
        └── Extracts structured facts → upserts into user_facts
```

---

## 12. Module Wiring

### Ingestion Module Imports

```
IngestionModule
├── TypeOrmModule.forFeature([IngestedItem, FileObject])
├── BullModule.registerQueue(
│     LINK_PROCESSING,
│     TEXT_PROCESSING,
│     FILE_PROCESSING
│   )
├── StorageModule       (for presigned URLs)
├── MemoriesModule      (for creating MemoryItems)
└── AiModule            (for text summarization)
```

### Cross-Queue Dependencies

The ingestion module's processors enqueue jobs on the core memory queues:

```
ingestion processors
  ├── EMBEDDING_GENERATION  (from jobs/queues/queue.constants.ts)
  └── FACT_EXTRACTION       (from jobs/queues/queue.constants.ts)
```

These core queues must be registered in the modules where the processors that enqueue to them live. The ingestion services import them via `BullModule.registerQueue()` in their respective modules.

### AppModule Registration

Add `IngestionModule` to the `AppModule` imports:

```typescript
@Module({
  imports: [
    // ... existing modules ...
    IngestionModule,
  ],
})
export class AppModule {}
```

---

## 13. Full Folder Tree

```
src/ingestion/
├── ingestion.module.ts
├── ingestion.controller.ts
├── ingestion.service.ts
│
├── entities/
│   └── ingested-item.entity.ts
│
├── dto/
│   ├── share-link.dto.ts
│   ├── share-text.dto.ts
│   ├── share-file-init.dto.ts
│   └── share-file-complete.dto.ts
│
├── services/
│   ├── link-processing.service.ts
│   ├── text-share-processing.service.ts
│   └── file-processing.service.ts
│
├── processors/
│   ├── link-processing.processor.ts
│   ├── text-processing.processor.ts
│   └── file-processing.processor.ts
│
└── queues/
    └── ingestion-queue.constants.ts
```

Shared modules referenced:

```
src/files/entities/file-object.entity.ts    (FileObject entity)
src/storage/storage.service.ts              (MinIO integration)
src/memories/memories.service.ts            (MemoryItem creation)
src/ai/ai.service.ts                        (text summarization)
src/jobs/queues/queue.constants.ts          (core memory queues)
```

### Total New Files: 13

| File | Type |
|---|---|
| `ingestion.module.ts` | Module |
| `ingestion.controller.ts` | Controller |
| `ingestion.service.ts` | Service |
| `ingested-item.entity.ts` | Entity |
| `share-link.dto.ts` | DTO |
| `share-text.dto.ts` | DTO |
| `share-file-init.dto.ts` | DTO |
| `share-file-complete.dto.ts` | DTO |
| `link-processing.service.ts` | Service |
| `text-share-processing.service.ts` | Service |
| `file-processing.service.ts` | Service |
| `link-processing.processor.ts` | BullMQ Processor |
| `text-processing.processor.ts` | BullMQ Processor |
| `file-processing.processor.ts` | BullMQ Processor |
| `ingestion-queue.constants.ts` | Constants |

### Updated Files: 2

| File | Changes |
|---|---|
| `storage.service.ts` | Updated `generateUploadUrl` and `generateDownloadUrl` to accept bucket + objectKey params |
| `app.module.ts` | Add `IngestionModule` to imports |

---

## Related Docs

- [01 — API Architecture](./01-api-architecture.md) — MinIO storage design, bucket structure, API endpoints
- [02 — Backend Blueprint](./02-backend-blueprint.md) — StorageService, FilesModule, and IngestionModule code
- [03 — Memory Strategy](./03-memory-strategy.md) — How ingested content is scored, stored, and decayed
- [04 — RAG Pipeline](./04-rag-pipeline.md) — How ingested content becomes searchable via embeddings
- [06 — Mobile Architecture](./06-mobile-architecture.md) — Share handler and share screen implementation
