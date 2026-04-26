# 🏗️ Arquitectura de Agentes - Factory Pattern

## Visión General

El sistema de agentes ahora utiliza una arquitectura **Factory + Configuración Centralizada** que permite definir diferentes tipos de chatbots (Manager y Client) con comportamientos y tools distintos.

```
┌─────────────────────────────────────────────────────────┐
│                   AgentsMap (Singleton)                  │
│  Punto de entrada para crear/obtener agentes             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│         ChatbotInitialSetup.getAgentType()               │
│  Detecta: ¿Es manager o client?                          │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│   Manager        │  │   Client         │
│   Factory        │  │   Factory        │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         ▼                     ▼
     Tools:              Tools:
   • change-prompt     • notify-manager
   • get-prompt
   • send-whatsapp
```

## Componentes

### 1. **agent-configs.ts** - Configuración Centralizada

Define qué puede hacer cada tipo de agente:

```typescript
export const AGENT_CONFIGS = {
  manager: {
    systemPrompt: "Eres el Asistente Administrativo...",
    toolIds: ['change-prompt', 'get-prompt', 'send-whatsapp'],
    canAccessAdminTools: true
  },
  
  client: {
    systemPrompt: "Eres el asistente de una tienda...",
    toolIds: ['notify-manager'],
    canAccessAdminTools: false
  }
};
```

### 2. **Factories** - Construcción Específica

Cada factory sabe cómo construir un agente de su tipo:

```typescript
// Manager: Incluye tools administrativas
ManagerAgentFactory.create(botSession, peerId)
  → Carga change-prompt + send-whatsapp

// Client: Incluye tools de notificación
ClientAgentFactory.create(botSession, peerId)
  → Carga notify-manager
```

### 3. **Tools** - Funcionalidades Específicas

| Tool | Tipo | Función |
|------|------|---------|
| `change-prompt` | Manager | Cambiar prompts de cliente/admin |
| `get-prompt` | Manager | Consultar prompts actuales |
| `send-whatsapp` | Manager | Enviar mensajes directos por WhatsApp |
| `notify-manager` | Client | Enviar notificación a administrators |

### 4. **Comandos Especiales** - Solo para Managers

Los managers tienen acceso a comandos especiales que se ejecutan antes de enviar el mensaje al LLM:

| Comando | Función |
|---------|---------|
| `/reset` | Borra todo el historial de conversación |

### 5. **ChatbotInitialSetup** - Detección de Tipo

Determina si un usuario es manager o cliente:

```typescript
await ChatbotInitialSetup.getAgentType(botSession, peerId)
→ "manager" | "client"
```

## Flujo de Ejecución

```
Usuario envía mensaje
         │
         ▼
AgentsMap.getOrCreate("bot123:user456")
         │
         ├─ Extrae: botSession="bot123", peerId="user456"
         │
         ▼
ChatbotInitialSetup.getAgentType(botSession, peerId)
         │
         ├─ Verifica si user456 está en managers list
         ├─ Si está → "manager"
         ├─ Si no → "client"
         │
         ▼
factory.create(botSession, peerId)
         │
         ├─ ManagerAgentFactory.create() O
         ├─ ClientAgentFactory.create()
         │
         ▼
AiAgentBuilder.buildAsync()
         │
         └─ Carga tools según tipo
         └─ Carga historial persistido
         └─ Retorna AiAgent listo
```

## Agregar un Nuevo Tipo de Agente

### 1. Actualizar `agent-configs.ts`

```typescript
export type AgentType = 'manager' | 'client' | 'support'; // ← Agregar

export const AGENT_CONFIGS = {
  // ... existing ...
  
  support: {
    systemPrompt: "Eres especialista en soporte técnico...",
    toolIds: ['view-logs', 'escalate-manager'],
    canAccessAdminTools: true
  }
};
```

### 2. Crear Factory en `factories/support-agent-factory.ts`

```typescript
export class SupportAgentFactory {
  public static create(botSession: string, peerId: string, options?: {...}): AiAgentBuilder {
    const config = getConfigForType('support');
    const builder = new AiAgentBuilder()
      .withBotSession(botSession)
      .withPeerId(peerId)
      .withSystemPrompt(config.systemPrompt);
    
    config.toolIds.forEach((toolId) => {
      switch (toolId) {
        case 'view-logs': builder.withTool(createViewLogsTool(botSession)); break;
        case 'escalate-manager': builder.withTool(createEscalateManagerTool(botSession)); break;
      }
    });
    
    return builder;
  }
}
```

### 3. Actualizar `ChatbotInitialSetup.getAgentType()`

Agregar lógica para detectar si es support:

```typescript
const isSupport = peerId.includes('@support.') || /* otra lógica */;
if (isSupport) return 'support';
```

### 4. Actualizar `AgentsMap.createAgent()`

```typescript
const factory = agentType === 'manager' ? ManagerAgentFactory 
              : agentType === 'client' ? ClientAgentFactory
              : agentType === 'support' ? SupportAgentFactory
              : ClientAgentFactory; // default
```

## Ventajas de Esta Arquitectura

✅ **Escalable**: Agregar nuevos tipos es simple y aislado  
✅ **Mantenible**: Configuración centralizada, cambios en un lugar  
✅ **Type-Safe**: TypeScript ayuda a detectar errores  
✅ **Testeable**: Cada factory es independiente y mockeable  
✅ **Flexible**: Tools se cargan dinámicamente según tipo  
✅ **Separación de Responsabilidades**: Cada clase tiene una responsabilidad clara

## Notas de Implementación

- El archivo antiguo `src/agent/whatsapp-tool.ts` ahora re-exporta desde `src/agent/tools/whatsapp-tool.ts` (compatibilidad)
- Los tools se cargan dinámicamente en las factories, no hardcodeados en `AiAgentBuilder`
- `ChatbotInitialSetup.getPromptForPeer()` se mantiene para compatibilidad, pero usa `getAgentType()` internamente
