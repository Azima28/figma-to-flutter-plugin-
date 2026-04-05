import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges, addEdge, Node, Edge, Connection, NodeChange, EdgeChange, Handle, Position, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const EditableNode = ({ id, data, isConnectable }: any) => {
    const { setNodes } = useReactFlow();

    const onChange = (evt: any) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return { ...node, data: { ...node.data, label: evt.target.value } };
                }
                return node;
            })
        );
    };

    return (
        <div style={{
            border: '2px solid #555',
            borderRadius: '8px',
            padding: '10px',
            background: data.bg || '#fff',
            minWidth: '120px'
        }}>
            {!data.isInput && <Handle type="target" position={Position.Top} isConnectable={isConnectable} />}
            <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', textAlign: 'center', fontWeight: 'bold' }}>{data.typeLabel || 'Logic Node'}</div>
            <input
                value={data.label}
                onChange={onChange}
                className="nodrag"
                style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    width: '100%',
                    textAlign: 'center',
                    outline: 'none',
                    color: '#333'
                }}
            />
            {!data.isOutput && <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />}
        </div>
    );
};

const FlowActions = () => {
    const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();

    const onDeleteSelected = () => {
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((e) => !e.selected));
    };

    const onAddNode = (type: 'trigger' | 'action' | 'input') => {
        setNodes((nds) => {
            let bg, typeLabel;
            if (type === 'trigger') { bg = '#e0f7fa'; typeLabel = 'Batas: Tombol/Klik'; }
            if (type === 'action') { bg = '#fff3e0'; typeLabel = 'Aksi: Database/API'; }
            if (type === 'input') { bg = '#f3e5f5'; typeLabel = 'Kotak: Text Field'; }
            return [
                ...nds,
                {
                    id: Math.random().toString(),
                    position: { x: Math.random() * 200, y: Math.random() * 200 },
                    data: { label: 'Nama Layer Figma', isInput: type === 'trigger' || type === 'input', bg, typeLabel },
                    type: 'editableNode',
                }
            ];
        });
    };

    return (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 4, display: 'flex', gap: '6px' }}>
            <button onClick={() => onAddNode('action')} style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', background: '#fff3e0', border: '1px solid #ccc', fontWeight: 'bold' }}>+ ⚙️ Aksi/Logika</button>
            <button onClick={onDeleteSelected} style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', background: '#ffebee', border: '1px solid #ffcdd2', color: 'red', fontWeight: 'bold' }}>🗑 Hapus</button>
        </div>
    );
};

const nodeTypes = {
    editableNode: EditableNode,
};

function App() {
    const [ast, setAst] = useState<any>(null);
    const [dartCode, setDartCode] = useState<string | null>(null);
    const [syncFiles, setSyncFiles] = useState<{ path: string, content: string }[]>([]);
    const [binaryAssets, setBinaryAssets] = useState<{ name: string, data: Uint8Array }[]>([]);
    const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<'dart' | 'json' | 'nodes' | 'sync'>('nodes');
    const [selectedFrame, setSelectedFrame] = useState<string>('All');
    const [globalFrames, setGlobalFrames] = useState<string[]>([]);

    // React Flow Logic Nodes State
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
    const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), []);

    // GitHub Sync State
    const [repoUrl, setRepoUrl] = useState('');
    const [githubToken, setGithubToken] = useState('');
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    const [projectName, setProjectName] = useState('latihanlks1');
    const [prevProjectName, setPrevProjectName] = useState('latihanlks1');

    const handleGenerate = () => {
        setPrevProjectName(projectName);
        parent.postMessage({ pluginMessage: { type: 'generate', logicNodes: nodes, logicEdges: edges, projectName } }, '*');
    };

    React.useEffect(() => {
        window.onmessage = (event) => {
            const msg = event.data.pluginMessage;
            if (msg && msg.type === 'load-config' && msg.config) {
                setRepoUrl(msg.config.repoUrl || '');
                setGithubToken(msg.config.githubToken || '');
                const savedName = msg.config.projectName || 'latihanlks1';
                setProjectName(savedName);
                setPrevProjectName(savedName);
            } else if (msg && msg.type === 'ast-generated') {
                setAst(msg.ast);
                setDartCode(msg.dartCode);
                setSyncFiles(msg.files || []);
                setBinaryAssets(msg.binaryAssets || []);
                setGlobalFrames(msg.frameNames || []);

                // Auto-Scraping Logic Nodes
                if (msg.scrapedNodes && msg.scrapedNodes.length > 0) {
                    setNodes(prevNodes => {
                        let newNodes = [...prevNodes];
                        let yOffset = Object.keys(newNodes).length > 0 ? 250 : 50;
                        let xOffset = 50;

                        msg.scrapedNodes.forEach((scraped: any) => {
                            // Cek apakah node dengan label ini sudah ada di canvas
                            let exists = newNodes.some(n => n.data.label === scraped.name);
                            if (!exists) {
                                let bg, typeLabel;
                                if (scraped.type === 'trigger') { bg = '#e0f7fa'; typeLabel = 'Batas: Tombol/Klik'; }
                                if (scraped.type === 'input') { bg = '#f3e5f5'; typeLabel = 'Kotak: Text Field'; }

                                newNodes.push({
                                    id: 'auto_' + Math.random().toString(),
                                    position: { x: xOffset, y: yOffset },
                                    data: { label: scraped.name, isInput: true, bg, typeLabel, frame: scraped.frame },
                                    type: 'editableNode',
                                });
                                yOffset += 90;
                                if (yOffset > 400) {
                                    yOffset = 50;
                                    xOffset += 150;
                                }
                            }
                        });
                        return newNodes;
                    });
                }
            } else if (msg && msg.type === 'github-sync-result') {
                setSyncStatus(msg.success ? '✅ ' + msg.message : '❌ Error: ' + msg.message);
            }
        };
    }, []);

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '18px', margin: '0 0 16px', fontWeight: 600 }}>Figma to Flutter V4</h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                Pilih frame di Figma lalu ekstrak struktur AST komponennya (Mathematical Engine).
            </p>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Nama Proyek Flutter (Sesuaikan dengan pubspec.yaml)</label>
                <input
                    value={projectName}
                    onChange={(e) => {
                        const newName = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        
                        // Reaktif update semua file yang sudah ter-generate
                        setSyncFiles(prev => prev.map(file => {
                            let newContent = file.content;
                            if (file.path === 'pubspec.yaml') {
                                newContent = newContent.replace(`name: ${projectName}`, `name: ${newName}`);
                            } else {
                                const regex = new RegExp(`package:${projectName}/`, 'g');
                                newContent = newContent.replace(regex, `package:${newName}/`);
                            }
                            return { ...file, content: newContent };
                        }));

                        setProjectName(newName);
                        parent.postMessage({ pluginMessage: { type: 'save-config', config: { repoUrl, githubToken, projectName: newName } } }, '*');
                    }}
                    placeholder="ex: latihanlks1"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '12px' }}
                />
            </div>

            <button
                onClick={handleGenerate}
                style={{
                    background: '#0D99FF',
                    color: 'white',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%'
                }}
            >
                Compile Layout to AST
            </button>

            {ast && (
                <div style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <button onClick={() => setActiveTab('dart')} style={{ fontWeight: 600, padding: '4px 12px', background: activeTab === 'dart' ? '#333' : '#ddd', color: activeTab === 'dart' ? '#fff' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Dart Code</button>
                        <button onClick={() => setActiveTab('json')} style={{ fontWeight: 600, padding: '4px 12px', background: activeTab === 'json' ? '#333' : '#ddd', color: activeTab === 'json' ? '#fff' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>JSON AST</button>
                        <button onClick={() => setActiveTab('nodes')} style={{ fontWeight: 600, padding: '4px 12px', background: activeTab === 'nodes' ? '#333' : '#ddd', color: activeTab === 'nodes' ? '#fff' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Logic Nodes 🧩</button>
                        <button onClick={() => setActiveTab('sync')} style={{ fontWeight: 600, padding: '4px 12px', background: activeTab === 'sync' ? '#333' : '#ddd', color: activeTab === 'sync' ? '#fff' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>GitHub Sync 🐙</button>
                    </div>

                    {activeTab === 'json' && (
                        <pre style={{
                            background: '#1E1E1E',
                            color: '#F1E05A',
                            padding: '12px',
                            borderRadius: '6px',
                            overflowX: 'auto',
                            fontSize: '11px',
                            maxHeight: '340px'
                        }}>
                            {JSON.stringify(ast, null, 2)}
                        </pre>
                    )}

                    {activeTab === 'dart' && (
                        <div style={{ display: 'flex', width: '100%', height: '340px', background: '#fafafa', border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ width: '40%', borderRight: '1px solid #ddd', background: '#fff', overflowY: 'auto' }}>
                                {syncFiles.length === 0 ? (
                                    <div style={{ padding: '10px', fontSize: '11px', color: '#888' }}>Belum ada file.</div>
                                ) : (
                                    <>
                                        {(() => {
                                            // Grouping files by directory
                                            const groups: { [key: string]: any[] } = {};
                                            syncFiles.forEach(file => {
                                                let dir = 'Project Root';
                                                if (file.path.startsWith('lib/')) {
                                                    const parts = file.path.split('/');
                                                    if (parts.length > 2) {
                                                        dir = '📦 ' + parts.slice(0, -1).join('/');
                                                    } else {
                                                        dir = '📦 lib/ (Entry Point)';
                                                    }
                                                }
                                                if (!groups[dir]) groups[dir] = [];
                                                groups[dir].push(file);
                                            });

                                            return Object.keys(groups).sort((a, b) => {
                                                if (a === 'Project Root') return -1;
                                                if (b === 'Project Root') return 1;
                                                return a.localeCompare(b);
                                            }).map(groupName => (
                                                <div key={groupName}>
                                                    <div style={{ padding: '8px 10px', background: '#eee', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #ddd', color: '#333', marginTop: '1px' }}>{groupName}</div>
                                                    {groups[groupName].map(file => {
                                                        const i = syncFiles.indexOf(file);
                                                        const fileName = file.path.split('/').pop() || '';
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => setSelectedFileIndex(i)}
                                                                style={{
                                                                    padding: '8px 10px',
                                                                    fontSize: '11px',
                                                                    cursor: 'pointer',
                                                                    background: selectedFileIndex === i ? '#e3f2fd' : 'transparent',
                                                                    borderLeft: selectedFileIndex === i ? '3px solid #2196f3' : '3px solid transparent',
                                                                    color: selectedFileIndex === i ? '#0d47a1' : '#333',
                                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                                }}
                                                                title={file.path}
                                                            >
                                                                📄 {fileName}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ));
                                        })()}
                                    </>
                                )}
                            </div>
                            <div style={{ width: '60%', height: '100%' }}>
                                <textarea
                                    value={syncFiles.length > 0 && syncFiles[selectedFileIndex] ? syncFiles[selectedFileIndex].content : dartCode || '// Menunggu ekstrak struktur file...'}
                                    readOnly
                                    spellCheck={false}
                                    style={{ width: '100%', height: '100%', padding: '10px', fontSize: '11px', fontFamily: 'monospace', background: '#1E1E1E', border: 'none', resize: 'none', color: '#5AE8C9', outline: 'none' }}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'sync' && (
                        <div style={{ background: '#f0f0f0', padding: '16px', borderRadius: '6px', border: '1px solid #ddd' }}>
                            <h3 style={{ fontSize: '13px', marginTop: 0 }}>V4 Bi-Directional GitHub Sync</h3>
                            <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Target Repository</label>
                            <input
                                placeholder="ex: agust/flutter-app"
                                value={repoUrl} onChange={e => {
                                    setRepoUrl(e.target.value);
                                    parent.postMessage({ pluginMessage: { type: 'save-config', config: { repoUrl: e.target.value, githubToken, projectName } } }, '*');
                                }}
                                style={{ width: '100%', padding: '6px', marginBottom: '12px', boxSizing: 'border-box' }}
                            />
                            <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>GitHub Personal Access Token (PAT)</label>
                            <input
                                type="password"
                                placeholder="ghp_xxxxxxxxxxxx"
                                value={githubToken} onChange={e => {
                                    setGithubToken(e.target.value);
                                    parent.postMessage({ pluginMessage: { type: 'save-config', config: { repoUrl, githubToken: e.target.value, projectName } } }, '*');
                                }}
                                style={{ width: '100%', padding: '6px', marginBottom: '16px', boxSizing: 'border-box' }}
                            />
                            <button
                                onClick={async () => {
                                    if (!repoUrl || !githubToken) {
                                        setSyncStatus('❌ Lengkapi Target Repo dan Token dulu!');
                                        return;
                                    }
                                    if (!dartCode) {
                                        setSyncStatus('❌ Anda belum melakukan Compile Layout ke AST!');
                                        return;
                                    }

                                    setSyncStatus('Sedang Menghubungi GitHub API...');
                                    try {
                                        // 1. Convert Dart Code to base64
                                        const base64Code = btoa(unescape(encodeURIComponent(dartCode)));
                                        const filename = 'lib/screens/figma_design_export.dart';
                                        const branchName = 'figma-sync-' + Date.now();

                                        const headers = {
                                            'Authorization': `token ${githubToken}`,
                                            'Accept': 'application/vnd.github.v3+json',
                                            'Content-Type': 'application/json'
                                        };

                                        // 2. Handle Repo Check & Get Base SHA
                                        const repoInfo = await fetch(`https://api.github.com/repos/${repoUrl}`, { headers });
                                        if (!repoInfo.ok) {
                                            const errorData = await repoInfo.json().catch(() => ({}));
                                            throw new Error(`Ditolak API GitHub (${repoInfo.status}): Pastikan nama Repo/Token Valid & Repo terisi. Detil: ${errorData.message}`);
                                        }
                                        const repoDataInfo = await repoInfo.json();
                                        const defaultBranch = repoDataInfo.default_branch || 'main';

                                        const refResponse = await fetch(`https://api.github.com/repos/${repoUrl}/git/refs/heads/${defaultBranch}`, { headers });
                                        if (!refResponse.ok) throw new Error(`Gagal membaca cabang '${defaultBranch}' di Repo.`);
                                        const refData = await refResponse.json();
                                        const baseSha = refData.object.sha;

                                        // 3. Create New Branch
                                        setSyncStatus(`Membuat cabang dari ${defaultBranch}...`);
                                        await fetch(`https://api.github.com/repos/${repoUrl}/git/refs`, {
                                            method: 'POST',
                                            headers,
                                            body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha })
                                        });

                                        // 4. Upload Text Files (Dart, YAML, etc.)
                                        let fileNames = [];
                                        for (let i = 0; i < syncFiles.length; i++) {
                                            let file = syncFiles[i];
                                            setSyncStatus(`Mengunggah file teks ${i + 1}/${syncFiles.length}: ${file.path}...`);
                                            const base64Code = btoa(unescape(encodeURIComponent(file.content)));
                                            await fetch(`https://api.github.com/repos/${repoUrl}/contents/${file.path}`, {
                                                method: 'PUT',
                                                headers,
                                                body: JSON.stringify({
                                                    message: `🎨 Menerapkan UI ${file.path.split('/').pop()} dari Figma (V4 Ecosystem)`,
                                                    content: base64Code,
                                                    branch: branchName
                                                })
                                            });
                                            fileNames.push('`' + file.path + '`');
                                        }

                                        // 5. Upload Binary Assets (Images)
                                        for (let i = 0; i < binaryAssets.length; i++) {
                                            let asset = binaryAssets[i];
                                            setSyncStatus(`Mengunggah aset biner ${i + 1}/${binaryAssets.length}: ${asset.name}...`);
                                            
                                            // Convert Uint8Array to base64
                                            let binary = '';
                                            const bytes = new Uint8Array(asset.data);
                                            const len = bytes.byteLength;
                                            for (let j = 0; j < len; j++) {
                                                binary += String.fromCharCode(bytes[j]);
                                            }
                                            const base64Asset = btoa(binary);

                                            await fetch(`https://api.github.com/repos/${repoUrl}/contents/assets/images/${asset.name}`, {
                                                method: 'PUT',
                                                headers,
                                                body: JSON.stringify({
                                                    message: `🖼️ Menambahkan aset gambar ${asset.name} dari Figma`,
                                                    content: base64Asset,
                                                    branch: branchName
                                                })
                                            });
                                            fileNames.push('`assets/images/' + asset.name + '`');
                                        }

                                        // 6. Create Pull Request
                                        setSyncStatus('Membuat Pull Request...');
                                        const prResponse = await fetch(`https://api.github.com/repos/${repoUrl}/pulls`, {
                                            method: 'POST',
                                            headers,
                                            body: JSON.stringify({
                                                title: '🚀 UI Update from Figma',
                                                body: `Pembaruan otomatis yang di-generate dari Figma Plugin The Living Ecosystem V4.\n\nFile yang terdampak:\n- ${fileNames.join('\n- ')}\n\nSilakan review code sebelum di-merge.`,
                                                head: branchName,
                                                base: defaultBranch
                                            })
                                        });
                                        const prData = await prResponse.json();

                                        if (prResponse.ok) {
                                            setSyncStatus(`✅ Berhasil! Pull Request #${prData.number} dibuat di GitHub.`);
                                        } else {
                                            throw new Error(prData.message || "Gagal membuat PR");
                                        }
                                    } catch (e: any) {
                                        setSyncStatus('❌ Error: ' + e.message);
                                    }
                                }}
                                style={{ width: '100%', padding: '10px', background: '#2da44e', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                Push AST Changes to GitHub
                            </button>

                            {syncStatus && (
                                <p style={{ fontSize: '11px', marginTop: '12px', color: syncStatus.includes('✅') ? 'green' : (syncStatus.includes('❌') ? 'red' : '#666') }}>{syncStatus}</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'nodes' && (
                        <div style={{ width: '100%', height: '340px', background: '#fafafa', border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 50 }}>
                                <select
                                    value={selectedFrame}
                                    onChange={(e) => setSelectedFrame(e.target.value)}
                                    style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '11px', fontWeight: 'bold', background: '#fff' }}
                                >
                                    <option value="All">Semua Halaman UI</option>
                                    {globalFrames.map(f => (
                                        <option key={f} value={f}>Frame: {f}</option>
                                    ))}
                                </select>
                            </div>
                            <ReactFlowProvider>
                                <FlowActions />
                                <ReactFlow
                                    nodes={nodes.map(n => ({
                                        ...n,
                                        hidden: selectedFrame !== 'All' && !!n.data?.frame && n.data.frame !== selectedFrame
                                    }))}
                                    edges={edges.map(e => {
                                        let h = false;
                                        if (selectedFrame !== 'All') {
                                            const sNode = nodes.find(n => n.id === e.source);
                                            const tNode = nodes.find(n => n.id === e.target);
                                            h = (!!sNode?.data?.frame && sNode.data.frame !== selectedFrame) || (!!tNode?.data?.frame && tNode.data.frame !== selectedFrame);
                                        }
                                        return { ...e, hidden: h };
                                    })}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onConnect={onConnect}
                                    nodeTypes={nodeTypes}
                                    fitView
                                >
                                    <Background />
                                    <Controls />
                                </ReactFlow>
                            </ReactFlowProvider>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const rootElement = document.getElementById('react-page');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
