import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, HardDrive, Hash, Image as ImageIcon, Video, Activity, RefreshCw, MonitorUp, Plus, Trash2, ShieldAlert, Globe } from 'lucide-react';
import './index.css';

const API_BASE = window.location.origin.includes('localhost') 
  ? 'http://localhost:3001/api' 
  : '/api';

function App() {
  const [activeTab, setActiveTab] = useState('discord');
  
  // New State for servers
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  
  const [config, setConfig] = useState({
    settings: {
      sourceGuild: '',
      sourceChannel: '',
      destGuild: '',
      destChannel: '',
      limit: 100,
      mediaTypes: { images: true, videos: true },
      deleteAfterSync: false,
      ignoreBots: true,
      dryRun: false,
      postDelay: 2.5
    }
  });

  const [redditConfig, setRedditConfig] = useState({
    settings: {
      globalInterval: 10,
      feeds: []
    }
  });

  const [redgifsConfig, setRedgifsConfig] = useState({
    settings: {
      globalInterval: 10,
      feeds: []
    }
  });

  const [webConfig, setWebConfig] = useState({
    settings: {
      globalInterval: 10,
      feeds: []
    }
  });

  const [status, setStatus] = useState({
    isReady: false,
    isRunning: false,
    isRedditRunning: false,
    isRedgifsRunning: false,
    isWebRunning: false,
    progress: { total: 0, processed: 0, skipped: 0, errors: 0 }
  });

  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState([]);
  const terminalRef = useRef(null);
  const isFirstLoadRef = useRef(true);
  const isConfigLoadedRef = useRef(false);

  const DELAY_OPTIONS = [
    { value: 1, label: '1 Second' },
    { value: 2.5, label: '2.5 Seconds' },
    { value: 5, label: '5 Seconds' },
    { value: 10, label: '10 Seconds' },
    { value: 30, label: '30 Seconds' },
    { value: 60, label: '1 Minute' },
    { value: 120, label: '2 Minutes' },
    { value: 300, label: '5 Minutes' },
    { value: 600, label: '10 Minutes' }
  ];

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(() => {
      if (selectedGuildId) {
        fetchStatus();
        fetchLogs();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedGuildId]);

  useEffect(() => {
    if (terminalRef.current) {
      const terminal = terminalRef.current;
      const isNearBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 120;
      if (isNearBottom || isFirstLoadRef.current) {
        terminal.scrollTop = terminal.scrollHeight;
        if (logs.length > 0) {
          isFirstLoadRef.current = false;
        }
      }
    }
  }, [logs]);

  // Auto-save Reddit Settings
  useEffect(() => {
    if (!selectedGuildId || !isConfigLoadedRef.current) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/reddit/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: selectedGuildId, settings: redditConfig.settings })
        });
        console.log('Reddit settings autosaved!');
      } catch (err) {
        console.error('Reddit autosave error:', err);
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [redditConfig]);

  // Auto-save Web Settings
  useEffect(() => {
    if (!selectedGuildId || !isConfigLoadedRef.current) return;
    const delayDebounceFn = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/web/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: selectedGuildId, settings: webConfig.settings })
        });
      } catch (err) {}
    }, 1000);
    return () => clearTimeout(delayDebounceFn);
  }, [webConfig]);

  // Auto-save Redgifs Settings
  useEffect(() => {
    if (!selectedGuildId || !isConfigLoadedRef.current) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/redgifs/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: selectedGuildId, settings: redgifsConfig.settings })
        });
        console.log('Redgifs settings autosaved!');
      } catch (err) {
        console.error('Redgifs autosave error:', err);
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [redgifsConfig]);

  const fetchConfig = async (guildId = null) => {
    try {
      const targetGuild = guildId || selectedGuildId;
      const [discordRes, channelsRes] = await Promise.all([
        fetch(`${API_BASE}/config`),
        fetch(`${API_BASE}/channels`).catch(() => ({ json: () => ({ channels: [], guilds: [] }) }))
      ]);
      
      const discordData = await discordRes.json();
      if (discordData.settings) {
        setConfig(prev => ({
          ...prev,
          settings: { ...prev.settings, ...discordData.settings }
        }));
      }

      if (channelsRes) {
        const channelsData = await channelsRes.json();
        if (channelsData.channels) {
          setChannels(channelsData.channels);
        }
        if (channelsData.guilds && channelsData.guilds.length > 0) {
          setGuilds(channelsData.guilds);
          const firstGuild = channelsData.guilds[0].id;
          const activeGuild = guildId || selectedGuildId || firstGuild;
          if (!selectedGuildId) setSelectedGuildId(activeGuild);
          // Fetch guild-specific configs
          await fetchGuildConfigs(activeGuild);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGuildConfigs = async (guildId) => {
    if (!guildId) return;
    isConfigLoadedRef.current = false;
    try {
      const [redditRes, redgifsRes, webRes] = await Promise.all([
        fetch(`${API_BASE}/reddit/config?guildId=${guildId}`),
        fetch(`${API_BASE}/redgifs/config?guildId=${guildId}`),
        fetch(`${API_BASE}/web/config?guildId=${guildId}`)
      ]);

      const redditData = await redditRes.json();
      if (redditData.settings) {
        setRedditConfig({
          settings: {
            globalInterval: redditData.settings.globalInterval || 10,
            feeds: redditData.settings.feeds || []
          }
        });
      }

      const redgifsData = await redgifsRes.json();
      if (redgifsData.settings) {
        setRedgifsConfig({
          settings: {
            globalInterval: redgifsData.settings.globalInterval || 10,
            feeds: redgifsData.settings.feeds || []
          }
        });
      }

      const webData = await webRes.json();
      if (webData.settings) {
        setWebConfig({
          settings: {
            globalInterval: webData.settings.globalInterval || 10,
            feeds: webData.settings.feeds || []
          }
        });
      }

      setTimeout(() => {
        isConfigLoadedRef.current = true;
      }, 500);
    } catch (err) {
      console.error(err);
    }
  };


  const fetchStatus = async () => {
    if (!selectedGuildId) return;
    try {
      const res = await fetch(`${API_BASE}/status?guildId=${selectedGuildId}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    if (!selectedGuildId) return;
    try {
      const res = await fetch(`${API_BASE}/logs?guildId=${selectedGuildId}`);
      const data = await res.json();
      setLogs(data.logs.reverse());
    } catch (err) {
      console.error(err);
    }
  };

  // Discord Handlers
  const handleSaveDiscord = async () => {
    try {
      const payload = { settings: config.settings };
      await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Discord Configuration saved successfully!');
    } catch (err) {
      alert('Failed to save configuration');
    }
  };

  const handleStartDiscord = async () => {
    try {
      await handleSaveDiscord();
      const res = await fetch(`${API_BASE}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopDiscord = async () => {
    try {
      await fetch(`${API_BASE}/stop`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Reddit Handlers — now pass guildId
  const handleSaveReddit = async () => {
    if (!selectedGuildId) return alert('Select a server first');
    try {
      await fetch(`${API_BASE}/reddit/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId, settings: redditConfig.settings })
      });
      alert('Reddit Configuration saved successfully!');
    } catch (err) {
      alert('Failed to save configuration');
    }
  };

  const handleStartReddit = async () => {
    if (!selectedGuildId) return alert('Select a server first');
    try {
      await handleSaveReddit();
      const res = await fetch(`${API_BASE}/reddit/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopReddit = async () => {
    if (!selectedGuildId) return;
    try {
      await fetch(`${API_BASE}/reddit/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Web Handlers
  const handleSaveWeb = async () => {
    if (!selectedGuildId) return alert('Select a server first.');
    try {
      await fetch(`${API_BASE}/web/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId, settings: webConfig.settings })
      });
      alert('Web Scraper Configuration saved successfully!');
    } catch (err) {
      alert('Failed to save Web config: ' + err.message);
    }
  };

  const handleStartWeb = async () => {
    if (!selectedGuildId) return alert('Select a server first.');
    try {
      await handleSaveWeb();
      const res = await fetch(`${API_BASE}/web/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId })
      });
      const data = await res.json();
      if (data.error) alert('Error: ' + data.error);
    } catch (err) {
      alert('Failed to start Web poller: ' + err.message);
    }
  };

  const handleStopWeb = async () => {
    if (!selectedGuildId) return;
    try {
      await fetch(`${API_BASE}/web/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId })
      });
    } catch (err) {
      alert('Failed to stop Web poller: ' + err.message);
    }
  };

  // Redgifs Handlers — now pass guildId
  const handleSaveRedgifs = async () => {
    if (!selectedGuildId) return alert('Select a server first');
    try {
      await fetch(`${API_BASE}/redgifs/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId, settings: redgifsConfig.settings })
      });
      alert('Redgifs Configuration saved successfully!');
    } catch (err) {
      alert('Failed to save configuration');
    }
  };

  const handleStartRedgifs = async () => {
    if (!selectedGuildId) return alert('Select a server first');
    try {
      await handleSaveRedgifs();
      const res = await fetch(`${API_BASE}/redgifs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopRedgifs = async () => {
    if (!selectedGuildId) return;
    try {
      await fetch(`${API_BASE}/redgifs/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // State Updaters
  const updateSetting = (key, value) => setConfig(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  const updateMediaType = (type, checked) => setConfig(prev => ({ ...prev, settings: { ...prev.settings, mediaTypes: { ...prev.settings.mediaTypes, [type]: checked } } }));

  // Reddit State Updaters
  const updateRedditGlobal = (key, value) => setRedditConfig(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  
  const addRedditFeed = () => {
    const newFeed = {
      id: Date.now().toString(),
      subreddit: '',
      channelId: '',
      guildId: selectedGuildId, // Automatically tag to selected Server
      embedMode: true,
      excludeNsfw: true,
      active: true,
      mediaTypes: { images: true, videos: true },
      postDelay: 2.5,
      sort: 'new',
      timeFilter: 'all'
    };
    setRedditConfig(prev => ({
      ...prev,
      settings: { ...prev.settings, feeds: [...prev.settings.feeds, newFeed] }
    }));
  };

  const removeRedditFeed = (id) => {
    setRedditConfig(prev => ({
      ...prev,
      settings: { ...prev.settings, feeds: prev.settings.feeds.filter(f => f.id !== id) }
    }));
  };

  const updateFeed = (id, key, value) => {
    setRedditConfig(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        feeds: prev.settings.feeds.map(f => f.id === id ? { ...f, [key]: value } : f)
      }
    }));
  };

  const updateFeedMediaType = (id, type, checked) => {
    setRedditConfig(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        feeds: prev.settings.feeds.map(f => f.id === id ? { ...f, mediaTypes: { ...f.mediaTypes, [type]: checked } } : f)
      }
    }));
  };

  // Web State Updaters
  const updateWebGlobal = (key, value) => setWebConfig(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  const addWebFeed = () => {
    if (!selectedGuildId) return alert('Please select a server first.');
    setWebConfig(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        feeds: [...prev.settings.feeds, { 
          id: Date.now().toString(),
          guildId: selectedGuildId,
          url: '',
          selector: 'img',
          channelId: channels.find(c => c.guildId === selectedGuildId)?.id || '',
          postDelay: 2.5,
          active: true 
        }]
      }
    }));
  };
  const removeWebFeed = (id) => {
    setWebConfig(prev => ({
      ...prev,
      settings: { ...prev.settings, feeds: prev.settings.feeds.filter(f => f.id !== id) }
    }));
  };
  const updateWebFeed = (id, key, value) => {
    setWebConfig(prev => ({
      ...prev,
      settings: { ...prev.settings, feeds: prev.settings.feeds.map(f => f.id === id ? { ...f, [key]: value } : f) }
    }));
  };
  const filteredWebFeeds = webConfig.settings.feeds.filter(f => f.guildId === selectedGuildId || !f.guildId);

  // Redgifs State Updaters
  const updateRedgifsGlobal = (key, value) => setRedgifsConfig(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  
  const addRedgifsFeed = () => {
    const newFeed = {
      id: Date.now().toString(),
      searchTerm: '',
      channelId: '',
      guildId: selectedGuildId, // Automatically tag to selected Server
      feedType: 'search', // default Redgifs feed type
      active: true,
      postDelay: 2.5,
      sort: 'recent',
      mediaType: 'all' // default media option
    };
    setRedgifsConfig(prev => ({
      ...prev,
      settings: { ...prev.settings, feeds: [...prev.settings.feeds, newFeed] }
    }));
  };

  const removeRedgifsFeed = (id) => {
    setRedgifsConfig(prev => ({
      ...prev,
      settings: { ...prev.settings, feeds: prev.settings.feeds.filter(f => f.id !== id) }
    }));
  };

  const updateRedgifsFeed = (id, key, value) => {
    setRedgifsConfig(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        feeds: prev.settings.feeds.map(f => f.id === id ? { ...f, [key]: value } : f)
      }
    }));
  };

  // Helper to filter channels by selected server
  const filteredChannels = channels.filter(c => c.guildId === selectedGuildId);

  // Helper to filter feeds by selected server
  const filteredRedditFeeds = redditConfig.settings.feeds.filter(f => f.guildId === selectedGuildId || !f.guildId);
  const filteredRedgifsFeeds = redgifsConfig.settings.feeds.filter(f => f.guildId === selectedGuildId || !f.guildId);

  return (
    <div className="app-container">
      <div className="header">
        <h1>Media Vault</h1>
        <p>Seamlessly backup media and integrate Reddit feeds directly into Discord</p>
      </div>

      {/* Connection Warning Banner */}
      {!status.isReady && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgb(239, 68, 68)',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#fca5a5'
        }}>
          <ShieldAlert size={20} />
          <div>
            <strong>Discord Client Offline:</strong> The bot is currently offline. Please configure a valid <code>DISCORD_TOKEN</code> inside your Railway variables so the server list and channels can populate!
          </div>
        </div>
      )}

      {/* Global Server Selector */}
      {status.isReady && guilds.length > 0 && (
        <div className="glass-panel" style={{ marginBottom: '2rem', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <HardDrive size={22} color="var(--accent)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Active Discord Server</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Configure setup & channel lists for this server</p>
            </div>
          </div>
          <select 
            className="form-control" 
            style={{ maxWidth: '300px', margin: 0, border: '1px solid var(--accent)' }} 
            value={selectedGuildId} 
            onChange={async e => {
              const newId = e.target.value;
              setSelectedGuildId(newId);
              if (!config.settings.sourceGuild) updateSetting('sourceGuild', newId);
              if (!config.settings.destGuild) updateSetting('destGuild', newId);
              // Reload per-guild configs for the newly selected server
              await fetchGuildConfigs(newId);
            }}
          >
            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center' }}>
        <button 
          className={`btn ${activeTab === 'discord' ? 'btn-primary' : ''}`}
          style={activeTab !== 'discord' ? { background: 'var(--bg-card)', color: 'var(--text-muted)' } : {}}
          onClick={() => setActiveTab('discord')}
        >
          <MonitorUp size={18} /> Discord Backup
        </button>
        <button 
          className={`btn ${activeTab === 'reddit' ? 'btn-primary' : ''}`}
          style={activeTab !== 'reddit' ? { background: 'var(--bg-card)', color: 'var(--text-muted)' } : {}}
          onClick={() => setActiveTab('reddit')}
        >
          <RefreshCw size={18} /> Reddit Feed
        </button>
        <button 
          className={`btn ${activeTab === 'redgifs' ? 'btn-primary' : ''}`}
          style={activeTab !== 'redgifs' ? { background: 'var(--bg-card)', color: 'var(--text-muted)' } : {}}
          onClick={() => setActiveTab('redgifs')}
        >
          <Video size={18} /> Redgifs Feed
        </button>
      </div>

      <div className="grid">
        <div className="glass-panel" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          
          {activeTab === 'discord' && (
            <>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <Settings size={24} color="var(--accent)" /> Discord Backup Config
              </h2>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><HardDrive size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Source Server ID</label>
                  <input type="text" className="form-control" placeholder="Source Server Guild ID..." value={config.settings.sourceGuild || selectedGuildId} onChange={e => updateSetting('sourceGuild', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Source Channel</label>
                  <input type="text" className="form-control" placeholder="Source Channel ID..." value={config.settings.sourceChannel} onChange={e => updateSetting('sourceChannel', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><HardDrive size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Dest Server ID</label>
                  <input type="text" className="form-control" placeholder="Destination Server Guild ID..." value={config.settings.destGuild || selectedGuildId} onChange={e => updateSetting('destGuild', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Dest Channel</label>
                  <input type="text" className="form-control" placeholder="Destination Channel ID..." value={config.settings.destChannel} onChange={e => updateSetting('destChannel', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Scan Limit (Messages)</label>
                  <input type="number" className="form-control" value={config.settings.limit} onChange={e => updateSetting('limit', parseInt(e.target.value) || 100)} />
                </div>
                
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Post Delay</label>
                  <select className="form-control" value={config.settings.postDelay} onChange={e => updateSetting('postDelay', parseFloat(e.target.value))}>
                    {DELAY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ minWidth: '150px' }}>
                  <label>Media Types</label>
                  <div className="toggle-group">
                    <label className="toggle">
                      <input type="checkbox" checked={config.settings.mediaTypes.images} onChange={e => updateMediaType('images', e.target.checked)} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}><ImageIcon size={16}/> Images</span>
                    </label>
                    <label className="toggle">
                      <input type="checkbox" checked={config.settings.mediaTypes.videos} onChange={e => updateMediaType('videos', e.target.checked)} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}><Video size={16}/> Videos</span>
                    </label>
                  </div>
                </div>

                <div className="form-group" style={{ minWidth: '150px' }}>
                  <label>Job Options</label>
                  <div className="toggle-group" style={{ flexWrap: 'wrap' }}>
                    <label className="toggle" title="Ignore messages from other bots">
                      <input type="checkbox" checked={config.settings.ignoreBots} onChange={e => updateSetting('ignoreBots', e.target.checked)} />
                      <span style={{ fontSize: '0.9rem' }}>Ignore Bots</span>
                    </label>
                    <label className="toggle" title="Delete original message after posting">
                      <input type="checkbox" checked={config.settings.deleteAfterSync} onChange={e => updateSetting('deleteAfterSync', e.target.checked)} />
                      <span style={{ fontSize: '0.9rem' }}>Delete Original</span>
                    </label>
                    <label className="toggle" title="Scan and log without actually posting">
                      <input type="checkbox" checked={config.settings.dryRun} onChange={e => updateSetting('dryRun', e.target.checked)} />
                      <span style={{ fontSize: '0.9rem' }}>Dry Run</span>
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={handleSaveDiscord} style={{ flex: 1 }}>
                  Save Settings
                </button>
                {!status.isRunning ? (
                  <button className="btn btn-primary" onClick={handleStartDiscord} style={{ flex: 1, background: 'var(--success)' }}>
                    <Play size={18} /> Start Backup
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={handleStopDiscord} style={{ flex: 1 }}>
                    <Square size={18} /> Stop Job
                  </button>
                )}
              </div>
            </>
          )}

          {activeTab === 'reddit' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <RefreshCw size={24} color="var(--accent)" /> Reddit Feeds Manager
                </h2>
                <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={addRedditFeed}>
                  <Plus size={16} /> Add Feed
                </button>
              </div>

              <div className="form-group" style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                <label style={{ marginBottom: '0.5rem', display: 'block' }}>Global Polling Interval</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[1, 5, 10, 15, 30, 60].map(mins => (
                    <button 
                      key={mins}
                      onClick={() => updateRedditGlobal('globalInterval', mins)}
                      style={{ 
                        flex: 1, 
                        padding: '0.5rem', 
                        borderRadius: '0.25rem', 
                        border: 'none', 
                        background: redditConfig.settings.globalInterval === mins ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {filteredRedditFeeds.map(feed => (
                <div key={feed.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: feed.active ? '4px solid var(--success)' : '4px solid #555' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flex: 1, marginRight: '1rem' }}>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label>Subreddit</label>
                        <input type="text" className="form-control" placeholder="e.g. aww" value={feed.subreddit} onChange={e => updateFeed(feed.id, 'subreddit', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Target Channel</label>
                        <select className="form-control" value={feed.channelId} onChange={e => updateFeed(feed.id, 'channelId', e.target.value)}>
                          <option value="">Select Channel...</option>
                          {filteredChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="btn btn-danger" style={{ padding: '0.5rem' }} onClick={() => removeRedditFeed(feed.id)} title="Remove Feed">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                      <label>Sort By</label>
                      <select className="form-control" value={feed.sort || 'new'} onChange={e => updateFeed(feed.id, 'sort', e.target.value)}>
                        <option value="new">New</option>
                        <option value="hot">Hot</option>
                        <option value="top">Top</option>
                        <option value="controversial">Controversial</option>
                      </select>
                    </div>

                    {(feed.sort === 'top' || feed.sort === 'controversial') && (
                      <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                        <label>Time Filter</label>
                        <select className="form-control" value={feed.timeFilter || 'all'} onChange={e => updateFeed(feed.id, 'timeFilter', e.target.value)}>
                          <option value="hour">Past Hour</option>
                          <option value="day">Past 24 Hours</option>
                          <option value="week">Past Week</option>
                          <option value="month">Past Month</option>
                          <option value="year">Past Year</option>
                          <option value="all">All Time</option>
                        </select>
                      </div>
                    )}

                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                      <label>Post Delay</label>
                      <select className="form-control" value={feed.postDelay || 2.5} onChange={e => updateFeed(feed.id, 'postDelay', parseFloat(e.target.value))}>
                        {DELAY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Post Format</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input type="checkbox" checked={feed.embedMode} onChange={e => updateFeed(feed.id, 'embedMode', e.target.checked)} />
                          <span style={{ fontSize: '0.85rem' }}>Rich Embed</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Media</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input type="checkbox" checked={feed.mediaTypes?.images ?? true} onChange={e => updateFeedMediaType(feed.id, 'images', e.target.checked)} />
                          <span style={{ fontSize: '0.85rem' }}>Images</span>
                        </label>
                        <label className="toggle">
                          <input type="checkbox" checked={feed.mediaTypes?.videos ?? true} onChange={e => updateFeedMediaType(feed.id, 'videos', e.target.checked)} />
                          <span style={{ fontSize: '0.85rem' }}>Videos</span>
                        </label>
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Settings</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input type="checkbox" checked={feed.excludeNsfw} onChange={e => updateFeed(feed.id, 'excludeNsfw', e.target.checked)} />
                          <span style={{ fontSize: '0.85rem' }}>No NSFW</span>
                        </label>
                        <label className="toggle">
                          <input type="checkbox" checked={feed.active} onChange={e => updateFeed(feed.id, 'active', e.target.checked)} />
                          <span style={{ fontSize: '0.85rem', color: feed.active ? 'var(--success)' : 'inherit' }}>Active</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filteredRedditFeeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No Reddit feeds configured for this server. Click "Add Feed" to start!
                </div>
              )}

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={handleSaveReddit} style={{ flex: 1 }}>
                  Save Settings
                </button>
                {!status.isRedditRunning ? (
                  <button className="btn btn-primary" onClick={handleStartReddit} style={{ flex: 1, background: 'var(--success)' }}>
                    <Play size={18} /> Start All Active Feeds
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={handleStopReddit} style={{ flex: 1 }}>
                    <Square size={18} /> Stop All Feeds
                  </button>
                )}
              </div>
            </>
          )}

          {activeTab === 'web' && (
          <div className="panel animate-fade-in">
            <div className="panel-header">
              <div className="panel-title">
                <div className="panel-icon">
                  <Globe size={24} color="var(--accent)" /> Web Scraper Feeds Manager
                </div>
                <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={addWebFeed}>
                  <Plus size={16} /> Add Web Feed
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '2rem' }}>
              <label>Global Polling Interval (Minutes)</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {[1, 5, 10, 15, 30, 60].map(mins => (
                  <button 
                    key={mins}
                    className="btn"
                    style={{ 
                      background: webConfig.settings.globalInterval === mins ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.2)'
                    }}
                    onClick={() => updateWebGlobal('globalInterval', mins)}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <p className="help-text">How often the bot checks all your web pages for new GIFs.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredWebFeeds.map(feed => (
                <div key={feed.id} className="feed-card animate-fade-in">
                  <div className="feed-header">
                    <div style={{ flex: 1 }}>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="https://example.com/gallery" 
                        value={feed.url} 
                        onChange={e => updateWebFeed(feed.id, 'url', e.target.value)} 
                        style={{ background: 'rgba(0,0,0,0.2)', border: 'none', fontWeight: 'bold' }}
                      />
                    </div>
                    <button className="btn btn-danger" style={{ padding: '0.5rem' }} onClick={() => removeWebFeed(feed.id)} title="Remove Feed">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="feed-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label>CSS Selector (Optional)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="img (Default)" 
                        value={feed.selector} 
                        onChange={e => updateWebFeed(feed.id, 'selector', e.target.value)} 
                      />
                      <p className="help-text" style={{ fontSize: '0.75rem' }}>E.g. .gallery img</p>
                    </div>

                    <div className="form-group">
                      <label>Target Channel</label>
                      <select className="form-control" value={feed.channelId} onChange={e => updateWebFeed(feed.id, 'channelId', e.target.value)}>
                        <option value="">Select a Channel...</option>
                        {channels.filter(c => c.guildId === selectedGuildId).map(c => (
                          <option key={c.id} value={c.id}>#{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Post Delay (Avoid Discord Rate Limit)</label>
                      <select className="form-control" value={feed.postDelay || 2.5} onChange={e => updateWebFeed(feed.id, 'postDelay', parseFloat(e.target.value))}>
                        {DELAY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '2rem' }}>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={feed.active} onChange={e => updateWebFeed(feed.id, 'active', e.target.checked)} />
                          <span className="slider"></span>
                        </label>
                        <span>Active</span>
                    </div>
                  </div>
                </div>
              ))}

              {filteredWebFeeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  No Web Scraper feeds configured for this server. Click "Add Web Feed" to start!
                </div>
              )}
            </div>

            <div className="actions" style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button className="btn btn-primary" onClick={handleSaveWeb} style={{ flex: 1 }}>
                <HardDrive size={18} /> Save Config
              </button>
              {!status.isWebRunning ? (
                <button className="btn btn-primary" onClick={handleStartWeb} style={{ flex: 1, background: 'var(--success)' }}>
                  <Play size={18} /> Start Web Poller
                </button>
              ) : (
                <button className="btn btn-danger" onClick={handleStopWeb} style={{ flex: 1 }}>
                  <Square size={18} /> Stop Web Poller
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'redgifs' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Video size={24} color="var(--accent)" /> Redgifs Feeds Manager
                </h2>
                <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={addRedgifsFeed}>
                  <Plus size={16} /> Add Feed
                </button>
              </div>

              <div className="form-group" style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                <label style={{ marginBottom: '0.5rem', display: 'block' }}>Global Polling Interval</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[1, 5, 10, 15, 30, 60].map(mins => (
                    <button 
                      key={mins}
                      onClick={() => updateRedgifsGlobal('globalInterval', mins)}
                      style={{ 
                        flex: 1, 
                        padding: '0.5rem', 
                        borderRadius: '0.25rem', 
                        border: 'none', 
                        background: redgifsConfig.settings.globalInterval === mins ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {filteredRedgifsFeeds.map(feed => (
                <div key={feed.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: feed.active ? '4px solid var(--success)' : '4px solid #555' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flex: 1, marginRight: '1rem' }}>
                      <div className="form-group" style={{ flex: '0 0 140px', margin: 0 }}>
                        <label>Feed Type</label>
                        <select className="form-control" value={feed.feedType || 'search'} onChange={e => updateRedgifsFeed(feed.id, 'feedType', e.target.value)}>
                          <option value="search">Search / Tags</option>
                          <option value="creator">Creator / User</option>
                          <option value="niche">Niche</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label>
                          {feed.feedType === 'creator' ? 'Redgifs Creator' : feed.feedType === 'niche' ? 'Redgifs Niche' : 'Search Term / Tag'}
                        </label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder={feed.feedType === 'creator' ? 'e.g. creator_name' : feed.feedType === 'niche' ? 'e.g. blonde' : 'e.g. gaming or #tag'} 
                          value={feed.searchTerm} 
                          onChange={e => updateRedgifsFeed(feed.id, 'searchTerm', e.target.value)} 
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Target Channel</label>
                        <select className="form-control" value={feed.channelId} onChange={e => updateRedgifsFeed(feed.id, 'channelId', e.target.value)}>
                          <option value="">Select Channel...</option>
                          {filteredChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="btn btn-danger" style={{ padding: '0.5rem' }} onClick={() => removeRedgifsFeed(feed.id)} title="Remove Feed">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                      <label>Sort By</label>
                      <select className="form-control" value={feed.sort || 'trending'} onChange={e => updateRedgifsFeed(feed.id, 'sort', e.target.value)}>
                        <option value="trending">Trending</option>
                        <option value="top">Top</option>
                        <option value="oldest">Oldest</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                      <label>Media Option</label>
                      <select className="form-control" value={feed.mediaType || 'all'} onChange={e => updateRedgifsFeed(feed.id, 'mediaType', e.target.value)}>
                        <option value="all">Videos & Pics</option>
                        <option value="videos">Videos Only</option>
                        <option value="images">Pics Only</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                      <label>Post Delay</label>
                      <select className="form-control" value={feed.postDelay || 2.5} onChange={e => updateRedgifsFeed(feed.id, 'postDelay', parseFloat(e.target.value))}>
                        {DELAY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Settings</label>
                      <div className="toggle-group">
                        <label className="toggle">
                          <input type="checkbox" checked={feed.active} onChange={e => updateRedgifsFeed(feed.id, 'active', e.target.checked)} />
                          <span style={{ fontSize: '0.85rem', color: feed.active ? 'var(--success)' : 'inherit' }}>Active</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filteredRedgifsFeeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No Redgifs feeds configured for this server. Click "Add Feed" to start!
                </div>
              )}

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={handleSaveRedgifs} style={{ flex: 1 }}>
                  Save Settings
                </button>
                {!status.isRedgifsRunning ? (
                  <button className="btn btn-primary" onClick={handleStartRedgifs} style={{ flex: 1, background: 'var(--success)' }}>
                    <Play size={18} /> Start All Active Feeds
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={handleStopRedgifs} style={{ flex: 1 }}>
                    <Square size={18} /> Stop All Feeds
                  </button>
                )}
              </div>
            </>
          )}

        </div>

        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Activity size={24} color="var(--success)" /> Live Activity
          </h2>

          {status.isRunning && activeTab === 'discord' && (
            <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Discord Backup: {status.progress.processed} / {status.progress.total || '?'} Processed</span>
                <span style={{ color: 'var(--text-muted)' }}>Skipped: {status.progress.skipped}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  background: 'var(--gradient)', 
                  width: `${status.progress.total ? Math.min(100, ((status.progress.processed + status.progress.skipped) / status.progress.total) * 100) : 0}%`,
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          )}

          {status.isRedditRunning && activeTab === 'reddit' && (
             <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span><RefreshCw size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }}/> Reddit Poller Active</span>
                 <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>● Running</span>
               </div>
             </div>
          )}

          {status.isRedgifsRunning && activeTab === 'redgifs' && (
             <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span><Video size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }}/> Redgifs Poller Active</span>
                 <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>● Running</span>
               </div>
             </div>
          )}

          <div ref={terminalRef} className="terminal" style={{ flex: 1, minHeight: 0, height: '400px', maxHeight: '500px', overflowY: 'auto' }}>
            {logs.filter(log => {
              if (activeTab === 'reddit') return log.message.includes('[Reddit]');
              if (activeTab === 'redgifs') return log.message.includes('[Redgifs]');
              return !log.message.includes('[Reddit]') && !log.message.includes('[Redgifs]');
            }).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>No logs yet for this server...</div>
            ) : (
              logs.filter(log => {
                if (activeTab === 'reddit') return log.message.includes('[Reddit]');
                if (activeTab === 'redgifs') return log.message.includes('[Redgifs]');
                return !log.message.includes('[Reddit]') && !log.message.includes('[Redgifs]');
              }).map(log => (
                <div key={log.id} className="log-line">
                  <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`log-${log.level}`}>{log.message}</span>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
