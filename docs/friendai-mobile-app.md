# FriendAI Mobile App — Implementation Spec

Complete implementation specification for the Expo React Native mobile client. Covers authentication, chat, memory browsing, share ingestion, and state management.

---

## Table of Contents

1. [App Overview](#1-app-overview)
2. [Tech Stack and Dependencies](#2-tech-stack-and-dependencies)
3. [Project Structure](#3-project-structure)
4. [Environment Config](#4-environment-config)
5. [Type Definitions](#5-type-definitions)
6. [API Client](#6-api-client)
7. [Auth Utilities](#7-auth-utilities)
8. [State Management](#8-state-management)
9. [Data Fetching Hooks](#9-data-fetching-hooks)
10. [Root Layout](#10-root-layout)
11. [Authentication Screens](#11-authentication-screens)
12. [Chat Screens](#12-chat-screens)
13. [Memories Screen](#13-memories-screen)
14. [Settings Screen](#14-settings-screen)
15. [Share Handler](#15-share-handler)
16. [Share Screen](#16-share-screen)
17. [Reusable Components](#17-reusable-components)
18. [Full Folder Tree](#18-full-folder-tree)

---

## 1. App Overview

FriendAI is an AI companion app. The mobile client provides:

- **Authentication** — register, login, secure token storage
- **Chat** — multi-turn conversations with an AI that remembers you
- **Memories** — browse what the AI remembers about you
- **Share ingestion** — send links, text, PDFs, and images from other apps into FriendAI via the share sheet
- **Settings** — view profile, log out

```
┌──────────────────────────────────┐
│         FriendAI Mobile          │
│                                  │
│  ┌────────┐ ┌────────┐ ┌──────┐ │
│  │  Chat  │ │Memories│ │ More │ │
│  └────┬───┘ └────┬───┘ └──┬───┘ │
│       │          │        │     │
│  Conversations  Memory   Settings│
│  Chat Screen    Cards    Profile │
│  Message Input  Search   Logout  │
│  AI Bubbles                      │
│                                  │
│  ┌─────────────────────────────┐ │
│  │    Share Extension          │ │
│  │  Links · Text · Files      │ │
│  │  → "Save to FriendAI"      │ │
│  └─────────────────────────────┘ │
└──────────────────────────────────┘
        │
        │ HTTPS (Bearer JWT)
        ▼
  NestJS API (port 3000)
```

---

## 2. Tech Stack and Dependencies

### Core

| Package | Purpose |
|---|---|
| `expo` | Framework |
| `expo-router` | File-based navigation |
| `react` / `react-native` | UI |
| `typescript` | Type safety |

### State and Data

| Package | Purpose |
|---|---|
| `zustand` | Global state (auth, chat) |
| `@tanstack/react-query` | Server data fetching, caching, mutations |
| `axios` | HTTP client with interceptors |

### Storage and Security

| Package | Purpose |
|---|---|
| `expo-secure-store` | JWT token storage (encrypted keychain) |

### UI

| Package | Purpose |
|---|---|
| `expo-haptics` | Haptic feedback on send |
| `@expo/vector-icons` | Icons |
| `react-native-safe-area-context` | Safe areas |
| `react-native-gesture-handler` | Gestures |

### Share Support

| Package | Purpose |
|---|---|
| `expo-linking` | Deep link handling |
| `expo-document-picker` | File selection |
| `expo-image-picker` | Image selection |
| `expo-file-system` | File upload to MinIO |
| `expo-sharing` | Share sheet integration |

### `package.json` additions

```json
{
  "dependencies": {
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.7.0",
    "expo-secure-store": "~14.0.0",
    "expo-document-picker": "~13.0.0",
    "expo-image-picker": "~16.0.0",
    "expo-file-system": "~18.0.0",
    "expo-clipboard": "~7.0.0"
  }
}
```

Exact versions depend on the Expo SDK version (54). Run `npx expo install` to get compatible versions.

---

## 3. Project Structure

```
mobile/
├── app/
│   ├── _layout.tsx                    # Root layout (providers, auth gate)
│   ├── index.tsx                      # Entry redirect
│   ├── login.tsx                      # Login screen
│   ├── register.tsx                   # Register screen
│   │
│   ├── (tabs)/
│   │   ├── _layout.tsx                # Tab navigator
│   │   ├── index.tsx                  # → chat/index (conversations)
│   │   ├── memories.tsx               # Memories screen
│   │   └── settings.tsx               # Settings screen
│   │
│   ├── chat/
│   │   ├── index.tsx                  # Conversation list
│   │   └── [conversationId].tsx       # Chat screen
│   │
│   └── share/
│       └── index.tsx                  # "Save to FriendAI" screen
│
├── components/
│   ├── ChatBubble.tsx
│   ├── MessageInput.tsx
│   ├── ConversationItem.tsx
│   ├── MemoryCard.tsx
│   └── LoadingIndicator.tsx
│
├── lib/
│   ├── api.ts                         # Axios client
│   ├── auth.ts                        # SecureStore helpers
│   ├── share-handler.ts               # Ingestion API calls
│   └── query-client.ts                # React Query client
│
├── store/
│   ├── auth-store.ts                  # Zustand auth state
│   └── chat-store.ts                  # Zustand chat state
│
├── hooks/
│   ├── useChat.ts                     # Chat data + mutations
│   ├── useConversations.ts            # Conversation list
│   └── useMemories.ts                 # Memory list + search
│
├── types/
│   └── api.ts                         # API type definitions
│
├── constants/
│   └── theme.ts                       # Colors, spacing, fonts
│
├── .env.example
├── app.json
├── package.json
└── tsconfig.json
```

---

## 4. Environment Config

### `mobile/.env.example`

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

Accessed in code as `process.env.EXPO_PUBLIC_API_URL`.

For development with a physical device, use the machine's LAN IP instead of `localhost`.

---

## 5. Type Definitions

### `types/api.ts`

All API request/response types in one file. Matches the NestJS backend DTOs.

```typescript
// ---- Auth ----

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone?: string;
  createdAt: string;
}

// ---- Conversations ----

export interface Conversation {
  id: string;
  title: string;
  summary?: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface ConversationListResponse {
  data: Conversation[];
  total: number;
}

// ---- Messages ----

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface SendMessageRequest {
  conversationId?: string;
  message: string;
}

export interface SendMessageResponse {
  conversationId: string;
  message: Message;
  assistantMessage: Message;
}

// ---- Memories ----

export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export interface MemoryItem {
  id: string;
  title: string;
  summary?: string;
  importance: number;
  memoryType: MemoryType;
  sourceType: string;
  tags: string[];
  createdAt: string;
}

export interface MemoryListResponse {
  data: MemoryItem[];
  total: number;
}

export interface MemorySearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  memoryTitle: string;
  memorySummary: string;
  importance: number;
  compositeScore: number;
}

// ---- Ingestion ----

export interface ShareLinkRequest {
  url: string;
  note?: string;
}

export interface ShareTextRequest {
  text: string;
  note?: string;
  sourceUrl?: string;
}

export interface ShareFileInitRequest {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ShareFileInitResponse {
  success: boolean;
  fileId: string;
  bucket: string;
  objectKey: string;
  uploadUrl: string;
}

export interface ShareFileCompleteRequest {
  fileId: string;
  note?: string;
}

export interface IngestionResponse {
  success: boolean;
  message: string;
  itemId: string;
  status: string;
}

// ---- API Wrapper ----

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}
```

---

## 6. API Client

### `lib/api.ts`

Axios instance with JWT token injection, base URL, and error handling.

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getToken } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — will be handled by auth store
    }
    return Promise.reject(error);
  },
);
```

### `lib/query-client.ts`

React Query client configuration.

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,       // 1 minute
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

---

## 7. Auth Utilities

### `lib/auth.ts`

Wrapper around `expo-secure-store` for encrypted JWT token persistence.

```typescript
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'friendai_auth_token';
const USER_KEY = 'friendai_user';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getStoredUser(): Promise<any | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setStoredUser(user: any): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
```

---

## 8. State Management

### `store/auth-store.ts`

Zustand store for authentication state. Handles login, register, logout, and session restoration.

```typescript
import { create } from 'zustand';
import { api } from '../lib/api';
import {
  setToken,
  setStoredUser,
  clearAuth,
  getToken,
  getStoredUser,
} from '../lib/auth';
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from '../types/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (data) => {
    const res = await api.post<AuthResponse>('/auth/login', data);
    const { accessToken, user } = res.data;
    await setToken(accessToken);
    await setStoredUser(user);
    set({ user, token: accessToken, isAuthenticated: true });
  },

  register: async (data) => {
    const res = await api.post<AuthResponse>('/auth/register', data);
    const { accessToken, user } = res.data;
    await setToken(accessToken);
    await setStoredUser(user);
    set({ user, token: accessToken, isAuthenticated: true });
  },

  logout: async () => {
    await clearAuth();
    set({ user: null, token: null, isAuthenticated: false });
  },

  restoreSession: async () => {
    try {
      const token = await getToken();
      const user = await getStoredUser();
      if (token && user) {
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
```

### `store/chat-store.ts`

Zustand store for chat state. Manages optimistic message sending and conversation tracking.

```typescript
import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  Message,
  SendMessageRequest,
  SendMessageResponse,
} from '../types/api';

interface ChatState {
  messages: Record<string, Message[]>;
  sending: boolean;
  activeConversationId: string | null;

  setActiveConversation: (id: string) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string | null, text: string) => Promise<SendMessageResponse>;
  addOptimisticMessage: (conversationId: string, message: Message) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  sending: false,
  activeConversationId: null,

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
  },

  loadMessages: async (conversationId) => {
    const res = await api.get(`/conversations/${conversationId}/messages`, {
      params: { limit: 50 },
    });
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: res.data.data,
      },
    }));
  },

  sendMessage: async (conversationId, text) => {
    set({ sending: true });

    try {
      const body: SendMessageRequest = { message: text };
      if (conversationId) body.conversationId = conversationId;

      const res = await api.post<SendMessageResponse>('/chat/send', body);
      const data = res.data;

      // Append both messages to the store
      set((state) => {
        const convId = data.conversationId;
        const existing = state.messages[convId] || [];
        return {
          messages: {
            ...state.messages,
            [convId]: [...existing, data.message, data.assistantMessage],
          },
          sending: false,
        };
      });

      return data;
    } catch (error) {
      set({ sending: false });
      throw error;
    }
  },

  addOptimisticMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message],
        },
      };
    });
  },
}));
```

---

## 9. Data Fetching Hooks

### `hooks/useConversations.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ConversationListResponse, Conversation } from '../types/api';

export function useConversations() {
  return useQuery<ConversationListResponse>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await api.get('/conversations', {
        params: { page: 1, limit: 50 },
      });
      return res.data;
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title?: string) => {
      const res = await api.post<Conversation>('/conversations', { title });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
```

### `hooks/useChat.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useChatStore } from '../store/chat-store';
import type { Message } from '../types/api';

export function useChat(conversationId: string) {
  const store = useChatStore();

  const messagesQuery = useQuery<{ data: Message[]; total: number }>({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const res = await api.get(`/conversations/${conversationId}/messages`, {
        params: { page: 1, limit: 100 },
      });
      return res.data;
    },
    enabled: !!conversationId,
  });

  const sendMessage = async (text: string) => {
    return store.sendMessage(conversationId, text);
  };

  return {
    messages: messagesQuery.data?.data ?? [],
    isLoading: messagesQuery.isLoading,
    isSending: store.sending,
    sendMessage,
    refetch: messagesQuery.refetch,
  };
}
```

### `hooks/useMemories.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { MemoryListResponse, MemorySearchResult } from '../types/api';

export function useMemories(page = 1, limit = 20) {
  return useQuery<MemoryListResponse>({
    queryKey: ['memories', page, limit],
    queryFn: async () => {
      const res = await api.get('/memories', {
        params: { page, limit },
      });
      return res.data;
    },
  });
}

export function useMemorySearch(query: string) {
  return useQuery<MemorySearchResult[]>({
    queryKey: ['memories', 'search', query],
    queryFn: async () => {
      const res = await api.get('/memories/search', {
        params: { q: query, limit: 10 },
      });
      return res.data;
    },
    enabled: query.length > 2,
  });
}
```

---

## 10. Root Layout

### `app/_layout.tsx`

Root layout with providers (React Query, auth gate). Redirects to login if not authenticated.

```typescript
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../store/auth-store';
import { LoadingIndicator } from '../components/LoadingIndicator';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, restoreSession } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return <LoadingIndicator fullScreen />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="chat/[conversationId]"
            options={{ headerShown: true, title: 'Chat' }}
          />
          <Stack.Screen
            name="share/index"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Save to FriendAI',
            }}
          />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}
```

### `app/index.tsx`

Entry point redirect.

```typescript
import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/auth-store';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/login'} />;
}
```

### `app/(tabs)/_layout.tsx`

Tab navigator with three tabs: Chat, Memories, Settings.

```typescript
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopWidth: 0.5, borderTopColor: '#e2e8f0' },
        headerStyle: { backgroundColor: '#ffffff' },
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: 'Memories',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="brain-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

---

## 11. Authentication Screens

### `app/login.tsx`

```typescript
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuthStore } from '../store/auth-store';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login({ email, password });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert(
        'Login Failed',
        error.response?.data?.message || 'Invalid credentials',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>FriendAI</Text>
        <Text style={styles.subtitle}>Welcome back</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <Link href="/register" style={styles.link}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#6366f1',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  button: {
    height: 50,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  link: { marginTop: 24, alignSelf: 'center' },
  linkText: { fontSize: 14, color: '#64748b' },
  linkBold: { color: '#6366f1', fontWeight: '600' },
});
```

### `app/register.tsx`

```typescript
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuthStore } from '../store/auth-store';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const router = useRouter();

  const handleRegister = async () => {
    if (!displayName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, displayName });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert(
        'Registration Failed',
        error.response?.data?.message || 'Could not create account',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>FriendAI</Text>
        <Text style={styles.subtitle}>Create your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#94a3b8"
          value={displayName}
          onChangeText={setDisplayName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password (8+ characters)"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating account...' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkBold}>Sign in</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#6366f1',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  button: {
    height: 50,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  link: { marginTop: 24, alignSelf: 'center' },
  linkText: { fontSize: 14, color: '#64748b' },
  linkBold: { color: '#6366f1', fontWeight: '600' },
});
```

---

## 12. Chat Screens

### `app/(tabs)/index.tsx` — Conversation List

```typescript
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useCreateConversation } from '../../hooks/useConversations';
import { ConversationItem } from '../../components/ConversationItem';
import { LoadingIndicator } from '../../components/LoadingIndicator';

export default function ConversationsScreen() {
  const { data, isLoading } = useConversations();
  const createConversation = useCreateConversation();
  const router = useRouter();

  const handleNewChat = async () => {
    try {
      const conversation = await createConversation.mutateAsync();
      router.push(`/chat/${conversation.id}`);
    } catch {
      // handled by error boundary
    }
  };

  if (isLoading) return <LoadingIndicator fullScreen />;

  return (
    <View style={styles.container}>
      <FlatList
        data={data?.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            conversation={item}
            onPress={() => router.push(`/chat/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>
              Start chatting with FriendAI
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleNewChat}>
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  list: { paddingVertical: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#334155' },
  emptySubtext: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
```

### `app/chat/[conversationId].tsx` — Chat Screen

```typescript
import { useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useChat } from '../../hooks/useChat';
import { ChatBubble } from '../../components/ChatBubble';
import { MessageInput } from '../../components/MessageInput';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import type { Message } from '../../types/api';

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { messages, isLoading, isSending, sendMessage } = useChat(conversationId!);
  const flatListRef = useRef<FlatList<Message>>(null);
  const [inputText, setInputText] = useState('');

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    setInputText('');
    try {
      await sendMessage(text);
    } catch {
      setInputText(text);
    }
  };

  if (isLoading) return <LoadingIndicator fullScreen />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListFooterComponent={isSending ? <LoadingIndicator /> : null}
      />

      <MessageInput
        value={inputText}
        onChangeText={setInputText}
        onSend={handleSend}
        disabled={isSending}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12 },
});
```

---

## 13. Memories Screen

### `app/(tabs)/memories.tsx`

```typescript
import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useMemories, useMemorySearch } from '../../hooks/useMemories';
import { MemoryCard } from '../../components/MemoryCard';
import { LoadingIndicator } from '../../components/LoadingIndicator';

export default function MemoriesScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const memoriesQuery = useMemories();
  const searchResults = useMemorySearch(searchQuery);

  const isSearching = searchQuery.length > 2;
  const isLoading = isSearching ? searchResults.isLoading : memoriesQuery.isLoading;

  const memories = isSearching
    ? (searchResults.data ?? []).map((r) => ({
        id: r.chunkId,
        title: r.memoryTitle,
        summary: r.content,
        importance: r.importance,
        memoryType: 'semantic' as const,
        sourceType: 'search',
        tags: [],
        createdAt: '',
        similarity: r.similarity,
      }))
    : memoriesQuery.data?.data ?? [];

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search memories..."
        placeholderTextColor="#94a3b8"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {isLoading ? (
        <LoadingIndicator fullScreen />
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MemoryCard memory={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {isSearching ? 'No matching memories' : 'No memories yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {isSearching
                  ? 'Try a different search'
                  : 'Chat with FriendAI to start building memories'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  searchInput: {
    height: 44,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    fontSize: 15,
    color: '#1e293b',
  },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#334155' },
  emptySubtext: { fontSize: 14, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
});
```

---

## 14. Settings Screen

### `app/(tabs)/settings.tsx`

```typescript
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../../store/auth-store';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('/share')}
        >
          <Text style={styles.menuText}>Save Content</Text>
          <Text style={styles.menuSubtext}>Share links, text, or files</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 20 },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#ffffff' },
  name: { fontSize: 20, fontWeight: '600', color: '#1e293b' },
  email: { fontSize: 14, color: '#64748b', marginTop: 2 },
  section: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuText: { fontSize: 16, fontWeight: '500', color: '#1e293b' },
  menuSubtext: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  logoutButton: {
    marginHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },
});
```

---

## 15. Share Handler

### `lib/share-handler.ts`

Functions for sending shared content to the ingestion API. Handles the two-step file upload flow (get presigned URL → upload to MinIO → call complete).

```typescript
import { api } from './api';
import * as FileSystem from 'expo-file-system';
import type {
  ShareLinkRequest,
  ShareTextRequest,
  ShareFileInitRequest,
  ShareFileInitResponse,
  ShareFileCompleteRequest,
  IngestionResponse,
} from '../types/api';

/**
 * Share a link with FriendAI.
 * The backend detects if it's a YouTube link, regular link, or PDF URL.
 */
export async function shareLink(
  url: string,
  note?: string,
): Promise<IngestionResponse> {
  const body: ShareLinkRequest = { url, note };
  const res = await api.post<IngestionResponse>('/ingestion/share-link', body);
  return res.data;
}

/**
 * Share a text snippet with FriendAI.
 */
export async function shareText(
  text: string,
  note?: string,
  sourceUrl?: string,
): Promise<IngestionResponse> {
  const body: ShareTextRequest = { text, note, sourceUrl };
  const res = await api.post<IngestionResponse>('/ingestion/share-text', body);
  return res.data;
}

/**
 * Share a file with FriendAI using the two-step upload flow.
 *
 * 1. Request a presigned upload URL from the API
 * 2. Upload the file directly to MinIO using the presigned URL
 * 3. Notify the API that upload is complete
 *
 * @param fileUri - local file URI (e.g., from document picker or image picker)
 * @param fileName - original filename
 * @param mimeType - MIME type
 * @param note - optional note from the user
 */
export async function shareFile(
  fileUri: string,
  fileName: string,
  mimeType: string,
  note?: string,
): Promise<IngestionResponse> {
  // Step 1: Get file info and request upload URL
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    throw new Error('File not found');
  }

  const initBody: ShareFileInitRequest = {
    fileName,
    mimeType,
    size: fileInfo.size ?? 0,
  };
  const initRes = await api.post<ShareFileInitResponse>(
    '/ingestion/share-file/init',
    initBody,
  );
  const { fileId, uploadUrl } = initRes.data;

  // Step 2: Upload file directly to MinIO via presigned URL
  await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': mimeType },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  // Step 3: Notify API that upload is complete
  const completeBody: ShareFileCompleteRequest = { fileId, note };
  const completeRes = await api.post<IngestionResponse>(
    '/ingestion/share-file/complete',
    completeBody,
  );

  return completeRes.data;
}

/**
 * Detect content type from a string.
 * Returns 'link' if it looks like a URL, 'text' otherwise.
 */
export function detectContentType(content: string): 'link' | 'text' {
  const trimmed = content.trim();
  if (/^https?:\/\//i.test(trimmed) && !trimmed.includes(' ')) {
    return 'link';
  }
  return 'text';
}
```

---

## 16. Share Screen

### `app/share/index.tsx`

Modal screen that appears when the user wants to save content to FriendAI. Supports link, text, and file input with an optional note.

```typescript
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { shareLink, shareText, shareFile, detectContentType } from '../../lib/share-handler';

type ShareMode = 'text' | 'link' | 'file';

export default function ShareScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<ShareMode>('text');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', '*/*'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
      });
      setMode('file');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === 'file' && selectedFile) {
        await shareFile(
          selectedFile.uri,
          selectedFile.name,
          selectedFile.mimeType,
          note || undefined,
        );
      } else if (mode === 'link' || detectContentType(content) === 'link') {
        await shareLink(content.trim(), note || undefined);
      } else {
        await shareText(content, note || undefined);
      }

      Alert.alert('Saved', 'Content saved to FriendAI', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Could not save content',
      );
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    mode === 'file' ? !!selectedFile : content.trim().length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode Selector */}
      <View style={styles.modeRow}>
        {(['text', 'link', 'file'] as ShareMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeButton, mode === m && styles.modeButtonActive]}
            onPress={() => setMode(m)}
          >
            <Ionicons
              name={
                m === 'text'
                  ? 'document-text-outline'
                  : m === 'link'
                    ? 'link-outline'
                    : 'attach-outline'
              }
              size={18}
              color={mode === m ? '#ffffff' : '#6366f1'}
            />
            <Text
              style={[
                styles.modeLabel,
                mode === m && styles.modeLabelActive,
              ]}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Input */}
      {mode === 'file' ? (
        <TouchableOpacity style={styles.filePicker} onPress={handlePickFile}>
          <Ionicons name="cloud-upload-outline" size={32} color="#6366f1" />
          <Text style={styles.filePickerText}>
            {selectedFile ? selectedFile.name : 'Tap to select a file'}
          </Text>
        </TouchableOpacity>
      ) : (
        <TextInput
          style={styles.contentInput}
          placeholder={mode === 'link' ? 'Paste a URL...' : 'Paste or type text...'}
          placeholderTextColor="#94a3b8"
          value={content}
          onChangeText={(text) => {
            setContent(text);
            if (detectContentType(text) === 'link') setMode('link');
          }}
          multiline
          textAlignVertical="top"
        />
      )}

      {/* Note Input */}
      <TextInput
        style={styles.noteInput}
        placeholder="Add a note (optional)"
        placeholderTextColor="#94a3b8"
        value={note}
        onChangeText={setNote}
      />

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave || saving}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveButtonText}>Save to FriendAI</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6366f1',
  },
  modeButtonActive: { backgroundColor: '#6366f1' },
  modeLabel: { fontSize: 14, fontWeight: '600', color: '#6366f1' },
  modeLabelActive: { color: '#ffffff' },
  contentInput: {
    height: 160,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  filePicker: {
    height: 160,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  filePickerText: { fontSize: 14, color: '#64748b', marginTop: 8 },
  noteInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    marginBottom: 20,
  },
  saveButton: {
    height: 50,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
});
```

---

## 17. Reusable Components

### `components/ChatBubble.tsx`

```typescript
import { View, Text, StyleSheet } from 'react-native';
import type { Message } from '../types/api';

interface Props {
  message: Message;
}

export function ChatBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAi]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 8,
    justifyContent: 'flex-start',
  },
  rowUser: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: '#f1f5f9',
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: 15, lineHeight: 21 },
  textUser: { color: '#ffffff' },
  textAi: { color: '#1e293b' },
});
```

### `components/MessageInput.tsx`

```typescript
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function MessageInput({ value, onChangeText, onSend, disabled }: Props) {
  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Message FriendAI..."
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={4000}
        editable={!disabled}
      />
      <TouchableOpacity
        style={[styles.sendButton, (!value.trim() || disabled) && styles.sendDisabled]}
        onPress={onSend}
        disabled={!value.trim() || disabled}
      >
        <Ionicons name="arrow-up" size={20} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#1e293b',
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
```

### `components/ConversationItem.tsx`

```typescript
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import type { Conversation } from '../types/api';

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

export function ConversationItem({ conversation, onPress }: Props) {
  const timeAgo = formatTimeAgo(conversation.lastMessageAt || conversation.createdAt);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {conversation.title || 'New Conversation'}
        </Text>
        {conversation.summary && (
          <Text style={styles.summary} numberOfLines={2}>
            {conversation.summary}
          </Text>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.time}>{timeAgo}</Text>
        <Text style={styles.count}>{conversation.messageCount} msgs</Text>
      </View>
    </TouchableOpacity>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  content: { flex: 1, marginRight: 12 },
  title: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  summary: { fontSize: 13, color: '#64748b', marginTop: 3, lineHeight: 18 },
  meta: { alignItems: 'flex-end' },
  time: { fontSize: 12, color: '#94a3b8' },
  count: { fontSize: 11, color: '#cbd5e1', marginTop: 4 },
});
```

### `components/MemoryCard.tsx`

```typescript
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  memory: {
    id: string;
    title: string;
    summary?: string;
    importance: number;
    memoryType: string;
    sourceType: string;
    tags: string[];
    createdAt: string;
    similarity?: number;
  };
}

const TYPE_COLORS: Record<string, string> = {
  episodic: '#8b5cf6',
  semantic: '#0ea5e9',
  procedural: '#f59e0b',
};

export function MemoryCard({ memory }: Props) {
  const typeColor = TYPE_COLORS[memory.memoryType] ?? '#94a3b8';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: typeColor + '20' }]}>
          <Text style={[styles.badgeText, { color: typeColor }]}>
            {memory.memoryType}
          </Text>
        </View>
        {memory.similarity !== undefined && (
          <Text style={styles.similarity}>
            {(memory.similarity * 100).toFixed(0)}% match
          </Text>
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {memory.title}
      </Text>

      {memory.summary && (
        <Text style={styles.summary} numberOfLines={3}>
          {memory.summary}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.source}>{memory.sourceType}</Text>
        {memory.createdAt && (
          <Text style={styles.date}>
            {new Date(memory.createdAt).toLocaleDateString()}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  similarity: { fontSize: 12, color: '#10b981', fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  summary: { fontSize: 13, color: '#64748b', lineHeight: 19 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  source: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' },
  date: { fontSize: 11, color: '#94a3b8' },
});
```

### `components/LoadingIndicator.tsx`

```typescript
import { View, ActivityIndicator, StyleSheet } from 'react-native';

interface Props {
  fullScreen?: boolean;
}

export function LoadingIndicator({ fullScreen }: Props) {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <ActivityIndicator size="small" color="#6366f1" />
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  inline: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
```

---

## 18. Full Folder Tree

```
mobile/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── login.tsx
│   ├── register.tsx
│   │
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx                  # Conversations list
│   │   ├── memories.tsx
│   │   └── settings.tsx
│   │
│   ├── chat/
│   │   └── [conversationId].tsx
│   │
│   └── share/
│       └── index.tsx
│
├── components/
│   ├── ChatBubble.tsx
│   ├── MessageInput.tsx
│   ├── ConversationItem.tsx
│   ├── MemoryCard.tsx
│   └── LoadingIndicator.tsx
│
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── query-client.ts
│   └── share-handler.ts
│
├── store/
│   ├── auth-store.ts
│   └── chat-store.ts
│
├── hooks/
│   ├── useChat.ts
│   ├── useConversations.ts
│   └── useMemories.ts
│
├── types/
│   └── api.ts
│
├── constants/
│   └── theme.ts
│
├── .env.example
├── app.json
├── package.json
└── tsconfig.json
```

### Total Files: 25

| Category | Count | Files |
|---|---|---|
| Screens | 8 | `_layout`, `index`, `login`, `register`, tabs (`_layout`, `index`, `memories`, `settings`), `chat/[conversationId]`, `share/index` |
| Components | 5 | `ChatBubble`, `MessageInput`, `ConversationItem`, `MemoryCard`, `LoadingIndicator` |
| Lib | 4 | `api`, `auth`, `query-client`, `share-handler` |
| Stores | 2 | `auth-store`, `chat-store` |
| Hooks | 3 | `useChat`, `useConversations`, `useMemories` |
| Types | 1 | `api` |
| Config | 2 | `.env.example`, `theme.ts` |

### Run Commands

```bash
cd mobile
npm install
npx expo install zustand @tanstack/react-query axios expo-secure-store expo-document-picker expo-image-picker expo-file-system
npx expo start
```
