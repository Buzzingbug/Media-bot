import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, HardDrive, Hash, Image as ImageIcon, Video, Activity, RefreshCw, MonitorUp, Key, Plus, Trash2 } from 'lucide-react';
import './index.css';

const API_BASE = 'http://localhost:3001/api';

function App() {
  const [activeTab, setActiveTab] = useState('discord');
  
  const [config, setConfig] = useState({
    token: '',
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

  const [status, setStatus] = useState({
    isReady: false,
    isRunning: false,
    isRedditRunning: false,
    isRedgifsRunning: false,
    progress: { total: 0, processed: 0, skipped: 0, errors: 0 }
  });

  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

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
      fetchStatus();
      fetchLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const fetchConfig = async () => {
    try {
      const [discordRes, redditRes, redgifsRes, channelsRes] = await Promise.all([
        fetch(`${API_BASE}/config`),
        fetch(`${API_BASE}/reddit/config`),
        fetch(`${API_BASE}/redgifs/config`),
        fetch(`${API_BASE}/channels`).catch(() => ({ json: () => ({ channels: [] }) }))
      ]);
      
      const discordData = await discordRes.json();
      if (discordData.settings) {
        setConfig(prev => ({
          ...prev,
          settings: { ...prev.settings, ...discordData.settings },
          token: discordData.hasToken ? '********' : ''
        }));
      }

      const redditData = await redditRes.json();
      if (redditData.settings) {
        setRedditConfig(prev => ({
          ...prev,
          settings: { 
            globalInterval: redditData.settings.globalInterval || 10,
            feeds: redditData.settings.feeds || [] 
          }
        }));
      }

      const redgifsData = await redgifsRes.json();
      if (redgifsData.settings) {
        setRedgifsConfig(prev => ({
          ...prev,
          settings: { 
            globalInterval: redgifsData.settings.globalInterval || 10,
            feeds: redgifsData.settings.feeds || [] 
          }
        }));
      }

      if (channelsRes) {
        const channelsData = await channelsRes.json();
        if (channelsData.channels) {
          setChannels(channelsData.channels);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`);
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
      if (config.token !== '********') payload.token = config.token;
      
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

  // Reddit Handlers
  const handleSaveReddit = async () => {
    try {
      await fetch(`${API_BASE}/reddit/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: redditConfig.settings })
      });
      alert('Reddit Configuration saved successfully!');
    } catch (err) {
      alert('Failed to save configuration');
    }
  };

  const handleStartReddit = async () => {
    try {
      await handleSaveReddit();
      const res = await fetch(`${API_BASE}/reddit/start`, { method: 'POST' });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopReddit = async () => {
    try {
      await fetch(`${API_BASE}/reddit/stop`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Redgifs Handlers
  const handleSaveRedgifs = async () => {
    try {
      await fetch(`${API_BASE}/redgifs/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: redgifsConfig.settings })
      });
      alert('Redgifs Configuration saved successfully!');
    } catch (err) {
      alert('Failed to save configuration');
    }
  };

  const handleStartRedgifs = async () => {
    try {
      await handleSaveRedgifs();
      const res = await fetch(`${API_BASE}/redgifs/start`, { method: 'POST' });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopRedgifs = async () => {
    try {
      await fetch(`${API_BASE}/redgifs/stop`, { method: 'POST' });
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

  // Redgifs State Updaters
  const updateRedgifsGlobal = (key, value) => setRedgifsConfig(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  
  const addRedgifsFeed = () => {
    const newFeed = {
      id: Date.now().toString(),
      searchTerm: '',
      channelId: '',
      active: true,
      postDelay: 2.5,
      sort: 'recent'
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

  return (
    <div className="app-container">
      <div className="header">
        <h1>Media Vault</h1>
        <p>Seamlessly backup media and integrate Reddit feeds directly into Discord</p>
      </div>

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
              
              <div className="form-group">
                <label>Discord Bot Token</label>
                <input type="password" className="form-control" placeholder="Paste your bot token here..." value={config.token} onChange={e => setConfig({...config, token: e.target.value})} />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><HardDrive size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Source Server ID</label>
                  <input type="text" className="form-control" value={config.settings.sourceGuild} onChange={e => updateSetting('sourceGuild', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Source Channel ID</label>
                  <select className="form-control" value={config.settings.sourceChannel} onChange={e => updateSetting('sourceChannel', e.target.value)}>
                    <option value="">Select Channel...</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name} ({c.guild})</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><HardDrive size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Dest Server ID</label>
                  <input type="text" className="form-control" value={config.settings.destGuild} onChange={e => updateSetting('destGuild', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Dest Channel ID</label>
                  <select className="form-control" value={config.settings.destChannel} onChange={e => updateSetting('destChannel', e.target.value)}>
                    <option value="">Select Channel...</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name} ({c.guild})</option>)}
                  </select>
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

              {redditConfig.settings.feeds.map(feed => (
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
                          {channels.map(c => <option key={c.id} value={c.id}>{c.name} ({c.guild})</option>)}
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

              {redditConfig.settings.feeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No Reddit feeds configured. Click "Add Feed" to start!
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

              {redgifsConfig.settings.feeds.map(feed => (
                <div key={feed.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: feed.active ? '4px solid var(--success)' : '4px solid #555' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flex: 1, marginRight: '1rem' }}>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label>Search Term</label>
                        <input type="text" className="form-control" placeholder="e.g. gaming" value={feed.searchTerm} onChange={e => updateRedgifsFeed(feed.id, 'searchTerm', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label><Hash size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Target Channel</label>
                        <select className="form-control" value={feed.channelId} onChange={e => updateRedgifsFeed(feed.id, 'channelId', e.target.value)}>
                          <option value="">Select Channel...</option>
                          {channels.map(c => <option key={c.id} value={c.id}>{c.name} ({c.guild})</option>)}
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
                      <select className="form-control" value={feed.sort || 'recent'} onChange={e => updateRedgifsFeed(feed.id, 'sort', e.target.value)}>
                        <option value="recent">Recent</option>
                        <option value="top">Top</option>
                        <option value="trending">Trending</option>
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

              {redgifsConfig.settings.feeds.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No Redgifs feeds configured. Click "Add Feed" to start!
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

          <div className="terminal" style={{ flex: 1, minHeight: 0, height: '400px', maxHeight: '500px' }}>
            {logs.filter(log => {
              if (activeTab === 'reddit') return log.message.startsWith('[Reddit]');
              if (activeTab === 'redgifs') return log.message.startsWith('[Redgifs]');
              return !log.message.startsWith('[Reddit]') && !log.message.startsWith('[Redgifs]');
            }).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>No logs yet...</div>
            ) : (
              logs.filter(log => {
                if (activeTab === 'reddit') return log.message.startsWith('[Reddit]');
                if (activeTab === 'redgifs') return log.message.startsWith('[Redgifs]');
                return !log.message.startsWith('[Reddit]') && !log.message.startsWith('[Redgifs]');
              }).map(log => (
                <div key={log.id} className="log-line">
                  <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`log-${log.level}`}>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
