├── backend
|  └── app
|  |  ├── api
|  |  |  ├── endpoints
|  |  |  |  ├── agent.py
|  |  |  |  ├── auth.py
|  |  |  |  ├── image_tasks.py
|  |  |  |  ├── media.py
|  |  |  |  ├── projects.py
|  |  |  |  ├── tasks.py
|  |  |  |  └── video_tasks.py
|  |  |  └── router.py
|  |  ├── core
|  |  |  ├── config.py
|  |  |  ├── database.py
|  |  |  ├── deps.py
|  |  |  ├── security.py
|  |  |  └── websocket.py
|  |  ├── main.py
|  |  ├── models
|  |  |  └── domain.py
|  |  ├── repositories
|  |  |  └── conversation.py
|  |  ├── services
|  |  |  ├── agent
|  |  |  |  ├── llm
|  |  |  |  |  ├── client_factory.py
|  |  |  |  |  ├── gateway.py
|  |  |  |  |  ├── model_resolver.py
|  |  |  |  |  └── __init__.py
|  |  |  |  ├── prompt
|  |  |  |  |  ├── builder.py
|  |  |  |  |  ├── skills.py
|  |  |  |  |  ├── templates.py
|  |  |  |  |  └── __init__.py
|  |  |  |  ├── readme.md
|  |  |  |  ├── runtime
|  |  |  |  |  ├── compaction.py
|  |  |  |  |  ├── recovery.py
|  |  |  |  |  ├── result.py
|  |  |  |  |  └── runtime.py
|  |  |  |  ├── schemas.py
|  |  |  |  ├── service
|  |  |  |  |  ├── chat_service.py
|  |  |  |  |  ├── frontend_tool_state.py
|  |  |  |  |  └── history_mapper.py
|  |  |  |  ├── skill_library
|  |  |  |  |  └── sd2-0提示词优化
|  |  |  |  └── tools
|  |  |  |  |  ├── frontend_tools.py
|  |  |  |  |  ├── registry.py
|  |  |  |  |  └── __init__.py
|  |  |  ├── ai_utils.py
|  |  |  ├── image_generation
|  |  |  |  ├── base.py
|  |  |  |  ├── factory.py
|  |  |  |  ├── providers
|  |  |  |  |  ├── volcengine.py
|  |  |  |  |  └── zhenzhen.py
|  |  |  |  └── utils.py
|  |  |  ├── image_service.py
|  |  |  ├── project_access.py
|  |  |  ├── video_generation
|  |  |  |  ├── base.py
|  |  |  |  ├── factory.py
|  |  |  |  ├── providers
|  |  |  |  |  ├── aliyun.py
|  |  |  |  |  ├── minimax.py
|  |  |  |  |  ├── volcengine.py
|  |  |  |  |  ├── volc_offical.py
|  |  |  |  |  └── zhenzhen.py
|  |  |  |  └── utils.py
|  |  |  └── video_service.py
|  |  └── utils
|  |  |  ├── file_utils.py
|  |  |  ├── oss_utils.py
|  |  |  └── __init__.py
├── frontend
|  ├── package.json
|  └── src
|  |  ├── App.jsx
|  |  ├── components
|  |  |  ├── agent
|  |  |  |  ├── AgentComposer.jsx
|  |  |  |  ├── AgentComposerActionMenu.jsx
|  |  |  |  ├── AgentModelSelect.jsx
|  |  |  |  ├── AgentSkillPicker.jsx
|  |  |  |  ├── agentUiClassNames.jsx
|  |  |  |  └── CanvasAgentWidget.jsx
|  |  |  ├── canvas
|  |  |  |  ├── CanvasMinimap.jsx
|  |  |  |  ├── DoodleCanvas.jsx
|  |  |  |  ├── Edge.jsx
|  |  |  |  ├── generation-panel
|  |  |  |  |  ├── components
|  |  |  |  |  ├── GenerationPanel.jsx
|  |  |  |  |  └── hooks
|  |  |  |  ├── GlobalDoodleBoard.jsx
|  |  |  |  ├── GroupNode.jsx
|  |  |  |  ├── ImageCropper.jsx
|  |  |  |  ├── nodes
|  |  |  |  |  ├── content
|  |  |  |  |  ├── NodeWrapper.jsx
|  |  |  |  |  ├── RegularNode.jsx
|  |  |  |  |  └── toolbars
|  |  |  |  └── TapnowCanvas.jsx
|  |  |  ├── common
|  |  |  |  ├── MediaPreview.jsx
|  |  |  |  └── Toast.jsx
|  |  |  └── ui
|  |  |     └── Popover.jsx
|  |  ├── config
|  |  |  ├── agent_models.js
|  |  |  ├── canvas.config.js
|  |  |  ├── constants.js
|  |  |  ├── env.js
|  |  |  ├── models.js
|  |  |  ├── nodeDerivation.js
|  |  |  ├── presets.js
|  |  |  └── updatesInformation.js
|  |  ├── hooks
|  |  |  ├── agent
|  |  |  |  ├── useAgentCanvasActionExecutor.js
|  |  |  |  ├── useAgentModels.js
|  |  |  |  ├── useAgentSkillMentions.js
|  |  |  |  ├── useAgentSkills.js
|  |  |  |  └── useCanvasAgentController.js
|  |  |  ├── common
|  |  |  |  └── useDebounce.js
|  |  |  ├── sync
|  |  |  |  ├── useCanvasSync.js
|  |  |  |  ├── useProjectData.js
|  |  |  |  ├── useTaskPolling.js
|  |  |  |  └── useYjsSandbox.js
|  |  |  ├── useCanvasHotkeys.js
|  |  |  ├── useCanvasInteraction.js
|  |  |  ├── useCanvasThumbnail.js
|  |  |  └── useNodeOperations.js
|  |  ├── main.jsx
|  |  ├── pages
|  |  |  ├── Dashboard
|  |  |  |  ├── components
|  |  |  |  |  ├── DashboardHeader.jsx
|  |  |  |  |  ├── MoveProjectDialog.jsx
|  |  |  |  |  ├── ProjectGridView.jsx
|  |  |  |  |  ├── ProjectItemActions.jsx
|  |  |  |  |  ├── ProjectListView.jsx
|  |  |  |  |  ├── RenameEditor.jsx
|  |  |  |  |  ├── Sidebar.jsx
|  |  |  |  |  └── UserManagementPage.jsx
|  |  |  |  ├── Dashboard.jsx
|  |  |  |  ├── hooks
|  |  |  |  |  ├── useProjectActions.js
|  |  |  |  |  └── useProjectRename.js
|  |  |  |  └── utils.js
|  |  |  └── LoginScreen.jsx
|  |  ├── services
|  |  |  ├── aiGenerationService.js
|  |  |  └── api.js
|  |  ├── store
|  |  |  └── useCanvasStore.js
|  |  └── utils
|  |     ├── agentCanvasNodeFactory.js
|  |     ├── geometry.js
|  |     ├── helpers.js
|  |     ├── http.js
|  |     ├── promptBuilder.js
|  |     └── sse.js