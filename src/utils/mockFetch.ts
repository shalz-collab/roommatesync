import { DBState, generateFutureSchedules } from './scheduler';

// Extract the initial state from server-db.json configuration
const INITIAL_DB: DBState = {
  users: [
    {
      id: "user-shalzz-admin",
      email: "hemapriyaachandran06@gmail.com",
      passwordHash: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f",
      name: "Shalzz",
      username: "shalzz",
      phone: "+91 8220911995",
      bio: "House Owner & Admin. Welcome to our shared apartment!",
      occupation: "Software Engineer",
      joinDate: "2026-07-01",
      roomNumber: "H-1109",
      socialLinks: {},
      emergencyContact: {
        name: "",
        phone: "",
        relation: ""
      },
      role: "admin",
      status: "online",
      avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=Shalzz",
      coverUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
      themePreference: "glass",
      accentColor: "#10b981",
      points: 100
    }
  ],
  teams: [],
  chores: [
    {
      id: "chore-1782971136836",
      title: "Hall Clean",
      description: "Vacuum and mop the main hall floor.",
      frequency: "Every Week",
      priority: "medium",
      estimatedTime: "30 mins",
      color: "emerald"
    }
  ],
  schedules: [],
  gallery: [],
  albums: [],
  notifications: [
    {
      id: "notif-1782971136837",
      userId: "all",
      title: "New Chore Published",
      message: "A new chore \"Hall Clean\" has been published. Frequency: Every Week, Priority: medium.",
      type: "chore",
      read: false,
      createdAt: "2026-07-02T05:45:36.837Z"
    },
    {
      id: "notif-1782970912058",
      userId: "all",
      title: "Welcome to Apartment Sync",
      message: "Shalzz (H-1109) has configured the apartment dashboard! Invite your roommates to get started.",
      type: "info",
      read: false,
      createdAt: "2026-07-01T10:00:00.000Z"
    }
  ],
  announcements: [
    {
      id: "ann-1782971248045",
      title: "Wi-Fi Router Password & Bills",
      content: "Please check the shared bills folder for this month's fiber internet contribution.",
      authorId: "user-shalzz-admin",
      createdAt: "2026-07-01T12:00:00.000Z"
    }
  ],
  chatMessages: [],
  history: []
};

// Database persistence helpers using localStorage
const getDB = (): DBState => {
  const data = localStorage.getItem('roommate_db');
  if (!data) {
    localStorage.setItem('roommate_db', JSON.stringify(INITIAL_DB));
    return JSON.parse(JSON.stringify(INITIAL_DB));
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return JSON.parse(JSON.stringify(INITIAL_DB));
  }
};

const saveDB = (db: DBState) => {
  localStorage.setItem('roommate_db', JSON.stringify(db));
};

// Cryptography and JWT Utilities for browser usage
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(payload: object): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days expiry
  }));
  return `${encodedHeader}.${encodedPayload}.mocksignature`;
}

function verifyToken(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    
    // Expiration check
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

// Helper to calculate house admin based on roommate vote tallies
const getElectedAdminId = (usersList: any[]): string | null => {
  const votes: Record<string, number> = {};
  let maxVotes = 0;
  let electedId: string | null = null;

  for (const u of usersList) {
    if (u.adminVote) {
      votes[u.adminVote] = (votes[u.adminVote] || 0) + 1;
    }
  }

  for (const userId in votes) {
    if (votes[userId] > maxVotes) {
      maxVotes = votes[userId];
      electedId = userId;
    }
  }

  return electedId;
};

// Rich user schema mapping (excluding password hashes and enrichment flags)
const getEnrichedUsers = (db: DBState) => {
  const rawUsers = db.users || [];
  const electedAdminId = getElectedAdminId(rawUsers);
  
  const voteCounts: Record<string, number> = {};
  for (const u of rawUsers) {
    if (u.adminVote) {
      voteCounts[u.adminVote] = (voteCounts[u.adminVote] || 0) + 1;
    }
  }

  return rawUsers.map((u, idx) => {
    const { passwordHash, ...rest } = u;
    const isOwner = u.username?.toLowerCase().includes('shalz') || u.name?.toLowerCase().includes('shalz') || u.email?.toLowerCase().includes('hemapriya') || idx === 0 || u.role === 'admin';
    const isAdmin = (electedAdminId && u.id === electedAdminId) || isOwner;
    return {
      ...rest,
      role: isAdmin ? ('admin' as const) : ('member' as const),
      adminVotesCount: voteCounts[u.id] || 0,
    };
  });
};

const getHeader = (headers: any, name: string): string | null => {
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }
  return headers[name] || headers[name.toLowerCase()] || null;
};

// Response helper
const mockResponse = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Save reference to native fetch
const originalFetch = window.fetch;

// Intercept window.fetch and serve using client-side in-memory mock database
window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : (input as Request).url || '';
  const urlObj = new URL(url, window.location.origin);
  let pathname = urlObj.pathname;

  // Handle repository path prefixes under custom bases
  const base = import.meta.env.BASE_URL || '/';
  if (base !== '/' && pathname.startsWith(base)) {
    pathname = pathname.substring(base.length - 1);
  }

  // Fallback to real fetch for non-API endpoints
  if (!pathname.includes('/api/')) {
    return originalFetch(input, init);
  }

  const method = (init?.method || 'GET').toUpperCase();
  const db = getDB();

  // Authentication Context Setup
  const authHeader = getHeader(init?.headers, 'Authorization');
  const token = authHeader && authHeader.split(' ')[1];
  const userPayload = token ? verifyToken(token) : null;

  const isAuthenticated = !!userPayload;

  // Helper parse request body
  let body: any = {};
  if (init?.body) {
    try {
      body = JSON.parse(init.body as string);
    } catch (e) {
      // Body is not JSON
    }
  }

  // Middleware simulation for Protected Routes
  const isAuthRoute = pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/register');
  if (!isAuthRoute && !isAuthenticated) {
    return mockResponse({ error: 'Access token required or invalid' }, 401);
  }

  // --- API ROUTE MATCHERS ---

  // Auth: Register
  if (pathname === '/api/auth/register' && method === 'POST') {
    let { email, password, name, username, role, roomNumber, phone } = body;
    if (!email || !password || !name) {
      return mockResponse({ error: 'Email, password, and Full Name are required' }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    let cleanUsername = username ? username.trim().toLowerCase() : '';
    if (!cleanUsername) {
      cleanUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 1000);
    }

    if (db.users.some((u) => u.email.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanUsername)) {
      return mockResponse({ error: 'An account with this email or username already exists' }, 400);
    }

    const passwordHash = await sha256(password);

    const newUser: any = {
      id: `user-${Date.now()}`,
      email: cleanEmail,
      passwordHash,
      name: name.trim(),
      username: cleanUsername,
      phone: phone ? phone.trim() : '',
      bio: 'New roommate here!',
      occupation: '',
      joinDate: new Date().toISOString().split('T')[0],
      roomNumber: roomNumber ? roomNumber.trim() : 'Unassigned',
      socialLinks: {},
      emergencyContact: { name: '', phone: '', relation: '' },
      role: role || 'member',
      status: 'online',
      avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
      coverUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
      themePreference: 'glass',
      accentColor: '#10b981',
      points: 0,
    };

    db.users.push(newUser);
    
    // Add join notification
    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: 'all',
      title: 'New Member Joined',
      message: `${name} (${newUser.roomNumber}) has joined adengappa 7 peru! Welcome them to the house.`,
      type: 'info',
      read: false,
      createdAt: new Date().toISOString(),
    });

    saveDB(db);
    const enriched = getEnrichedUsers(db);
    const registeredEnriched = enriched.find((u: any) => u.id === newUser.id) || newUser;
    const newToken = generateToken({ id: newUser.id, email: newUser.email, role: registeredEnriched.role });

    return mockResponse({ user: registeredEnriched, token: newToken }, 201);
  }

  // Auth: Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = body;
    if (!email || !password) {
      return mockResponse({ error: 'Email/username and password are required' }, 400);
    }

    const cleanInput = email.trim().toLowerCase();
    const candidateHash = await sha256(password);
    const userIndex = db.users.findIndex((u) => u.email.toLowerCase() === cleanInput || u.username.toLowerCase() === cleanInput);

    if (userIndex === -1 || db.users[userIndex].passwordHash !== candidateHash) {
      return mockResponse({ error: 'Invalid email/username or password' }, 400);
    }

    // Set online
    db.users[userIndex].status = 'online';
    saveDB(db);

    const enriched = getEnrichedUsers(db);
    const loggedInEnriched = enriched.find((u: any) => u.id === db.users[userIndex].id);
    const newToken = generateToken({ id: loggedInEnriched.id, email: loggedInEnriched.email, role: loggedInEnriched.role });

    return mockResponse({ user: loggedInEnriched, token: newToken });
  }

  // Auth: Me
  if (pathname === '/api/auth/me') {
    const enriched = getEnrichedUsers(db);
    const user = enriched.find((u: any) => u.id === userPayload.id);
    if (!user) {
      return mockResponse({ error: 'User not found' }, 404);
    }
    return mockResponse({ user });
  }

  // Users: List all users
  if (pathname === '/api/users' && method === 'GET') {
    return mockResponse(getEnrichedUsers(db));
  }

  // Users: Vote for House Admin
  if (pathname === '/api/users/vote' && method === 'POST') {
    const { voteForId } = body;
    const voterId = userPayload.id;

    if (!voteForId) {
      return mockResponse({ error: 'voteForId is required' }, 400);
    }

    const targetUser = db.users.find((u) => u.id === voteForId);
    if (!targetUser) {
      return mockResponse({ error: 'Roommate to vote for was not found' }, 404);
    }

    // Save vote
    const voterIdx = db.users.findIndex((u) => u.id === voterId);
    if (voterIdx !== -1) {
      db.users[voterIdx].adminVote = voteForId;
    }

    // Send a notification
    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: 'all',
      title: '🗳️ House Admin Vote Cast',
      message: `A roommate cast their vote for ${targetUser.name} to be the House Admin! Check the Roommate Directory to see the latest standings.`,
      type: 'info',
      read: false,
      createdAt: new Date().toISOString(),
    });

    saveDB(db);

    const enriched = getEnrichedUsers(db);
    const updatedUser = enriched.find((u: any) => u.id === voterId);

    return mockResponse({ success: true, user: updatedUser, users: enriched });
  }

  // Users: Update profile
  const userUpdateRegex = /^\/api\/users\/([^\/]+)$/;
  const userUpdateMatch = pathname.match(userUpdateRegex);
  if (userUpdateMatch && method === 'PUT') {
    const userId = userUpdateMatch[1];
    const userIdx = db.users.findIndex((u) => u.id === userId);
    if (userIdx === -1) {
      return mockResponse({ error: 'User not found' }, 404);
    }

    const updates = { ...body };
    if (updates.password) {
      updates.passwordHash = await sha256(updates.password);
      delete updates.password;
    }

    db.users[userIdx] = { ...db.users[userIdx], ...updates };
    saveDB(db);

    const enriched = getEnrichedUsers(db);
    const updatedEnriched = enriched.find((u: any) => u.id === userId);

    return mockResponse({ user: updatedEnriched });
  }

  // Users: Delete profile
  if (userUpdateMatch && method === 'DELETE') {
    const targetId = userUpdateMatch[1];
    const requesterId = userPayload.id;
    const enriched = getEnrichedUsers(db);
    const requester = enriched.find((u: any) => u.id === requesterId);

    const isSelf = requesterId === targetId;
    const isOwnerAdmin =
      requester?.role === 'admin' ||
      requester?.username?.toLowerCase().includes('shalz') ||
      requester?.name?.toLowerCase().includes('shalz') ||
      requester?.email?.toLowerCase().includes('hemapriya');

    if (!isSelf && !isOwnerAdmin) {
      return mockResponse({ error: 'Only the House Owner/Admin can delete other roommate profiles.' }, 403);
    }

    db.users = db.users.filter((u) => u.id !== targetId);
    db.teams = db.teams
      .map((t) => ({ ...t, members: t.members.filter((m) => m !== targetId) }))
      .filter((t) => t.members.length > 0);
    const validTeamIds = new Set(db.teams.map((t) => t.id));
    db.schedules = db.schedules.filter((s) => validTeamIds.has(s.teamId));

    db.gallery = db.gallery.filter((g) => g.userId !== targetId);
    db.albums = db.albums.filter((a) => a.userId !== targetId);
    db.announcements = db.announcements.filter((a) => a.authorId !== targetId);
    db.chatMessages = db.chatMessages.filter((c) => c.senderId !== targetId);
    db.notifications = db.notifications.filter((n) => n.userId !== targetId);
    if (db.history) {
      db.history = db.history.filter((h) => h.completedBy !== targetId && !h.completedBy.includes(targetId));
    }
    db.users = db.users.map((u) => u.adminVote === targetId ? { ...u, adminVote: undefined } : u);

    saveDB(db);
    return mockResponse({ success: true });
  }

  // Teams API
  if (pathname === '/api/teams') {
    if (method === 'GET') {
      return mockResponse(db.teams || []);
    }
    if (method === 'POST') {
      const { name, members } = body;
      if (!name || !members || members.length !== 2) {
        return mockResponse({ error: 'Teams must have exactly two members' }, 400);
      }
      const newTeam = {
        id: `team-${Date.now()}`,
        name,
        members,
      };
      db.teams.push(newTeam);
      saveDB(db);
      return mockResponse(newTeam, 201);
    }
  }

  const teamRegex = /^\/api\/teams\/([^\/]+)$/;
  const teamMatch = pathname.match(teamRegex);
  if (teamMatch) {
    const teamId = teamMatch[1];
    const teamIdx = db.teams.findIndex((t) => t.id === teamId);
    if (teamIdx === -1) return mockResponse({ error: 'Team not found' }, 404);

    if (method === 'PUT') {
      db.teams[teamIdx] = { ...db.teams[teamIdx], ...body };
      saveDB(db);
      return mockResponse(db.teams[teamIdx]);
    }
    if (method === 'DELETE') {
      db.teams = db.teams.filter((t) => t.id !== teamId);
      saveDB(db);
      return mockResponse({ success: true });
    }
  }

  // Chores API
  if (pathname === '/api/chores') {
    if (method === 'GET') {
      return mockResponse(db.chores || []);
    }
    if (method === 'POST') {
      const { title, description, frequency, priority, estimatedTime, color } = body;
      const newChore = {
        id: `chore-${Date.now()}`,
        title,
        description,
        frequency,
        priority,
        estimatedTime,
        color: color || 'indigo',
      };
      db.chores.push(newChore);

      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        userId: 'all',
        title: 'New Chore Published',
        message: `A new chore "${title}" has been published. Frequency: ${frequency}, Priority: ${priority}.`,
        type: 'chore',
        read: false,
        createdAt: new Date().toISOString(),
      });

      saveDB(db);
      return mockResponse(newChore, 201);
    }
  }

  const choreRegex = /^\/api\/chores\/([^\/]+)$/;
  const choreMatch = pathname.match(choreRegex);
  if (choreMatch) {
    const choreId = choreMatch[1];
    const choreIdx = db.chores.findIndex((c) => c.id === choreId);

    if (method === 'PUT') {
      if (choreIdx === -1) return mockResponse({ error: 'Chore not found' }, 404);
      db.chores[choreIdx] = { ...db.chores[choreIdx], ...body };
      saveDB(db);
      return mockResponse(db.chores[choreIdx]);
    }
    if (method === 'DELETE') {
      const chore = db.chores.find((c) => c.id === choreId);
      if (chore) {
        if (!db.history) db.history = [];
        db.history.unshift({
          id: `hist-${Date.now()}`,
          type: 'chore',
          title: chore.title,
          description: chore.description || `Frequency: ${chore.frequency}`,
          completedBy: userPayload.email || 'Roommate',
          completedAt: new Date().toISOString(),
          status: 'deleted',
          category: chore.frequency,
        });
      }
      db.chores = db.chores.filter((c) => c.id !== choreId);
      db.schedules = db.schedules.filter((s) => s.choreId !== choreId);
      saveDB(db);
      return mockResponse({ success: true });
    }
  }

  // Chore complete API
  const choreCompleteRegex = /^\/api\/chores\/([^\/]+)\/complete$/;
  const choreCompleteMatch = pathname.match(choreCompleteRegex);
  if (choreCompleteMatch && method === 'POST') {
    const choreId = choreCompleteMatch[1];
    const chore = db.chores.find((c) => c.id === choreId);
    if (!chore) return mockResponse({ error: 'Chore not found' }, 404);

    const { completedBy, comments } = body;
    const completionName = completedBy || 'Roommate';

    if (!db.history) db.history = [];
    db.history.unshift({
      id: `hist-${Date.now()}`,
      type: 'chore',
      title: chore.title,
      description: comments || `Completed via Mark Complete Module`,
      completedBy: completionName,
      completedAt: new Date().toISOString(),
      status: 'completed',
      category: chore.frequency,
    });

    // Reward points
    const userMatchIdx = db.users.findIndex((u) => u.name?.toLowerCase() === completionName?.toLowerCase() || u.email?.toLowerCase() === userPayload.email?.toLowerCase());
    if (userMatchIdx !== -1) {
      db.users[userMatchIdx].points = (db.users[userMatchIdx].points || 0) + 15;
    }

    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      userId: 'all',
      title: 'Chore Completed',
      message: `"${chore.title}" was completed by ${completionName}! +15 reward points earned.`,
      type: 'chore',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false,
      link: '/history',
    });

    saveDB(db);
    return mockResponse({ success: true, message: 'Chore completed successfully' });
  }

  // Schedules API
  if (pathname === '/api/schedules') {
    if (method === 'GET') {
      return mockResponse(db.schedules || []);
    }
  }

  if (pathname === '/api/schedules/generate' && method === 'POST') {
    const { count } = body;
    const generated = generateFutureSchedules(db, count || 1);
    saveDB(db);
    return mockResponse(generated);
  }

  const schedRegex = /^\/api\/schedules\/([^\/]+)$/;
  const schedMatch = pathname.match(schedRegex);
  if (schedMatch && method === 'PUT') {
    const schedId = schedMatch[1];
    const schedIdx = db.schedules.findIndex((s) => s.id === schedId);
    if (schedIdx === -1) return mockResponse({ error: 'Schedule item not found' }, 404);

    const { status, comments, photoProof } = body;
    const currentSched = db.schedules[schedIdx];

    const team = db.teams.find((t) => t.id === currentSched.teamId);

    const updates: any = { status };
    if (status === 'Completed') {
      updates.completedAt = new Date().toISOString();
      updates.comments = comments || 'Task completed!';
      updates.photoProof = photoProof || '';
      updates.completionTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const chore = db.chores.find((c) => c.id === currentSched.choreId);
      if (!db.history) db.history = [];
      db.history.unshift({
        id: `hist-${Date.now()}`,
        type: 'chore',
        title: chore?.title || 'Chore Task Completed',
        description: comments || `Completed by Team ${team?.name || 'Assigned Roommates'}`,
        completedBy: team?.name || userPayload.email || 'Roommate',
        completedAt: new Date().toISOString(),
        status: 'completed',
        category: chore?.frequency || 'Weekly',
      });

      // Reward points to team members
      if (team) {
        team.members.forEach((memberId) => {
          const mIdx = db.users.findIndex((u) => u.id === memberId);
          if (mIdx !== -1) {
            db.users[mIdx].points = (db.users[mIdx].points || 0) + 15;
          }
        });
      }

      // Notify other roommates
      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        userId: 'all',
        title: 'Chore Completed',
        message: `Team ${team?.name || ''} has completed: ${db.chores.find((c) => c.id === currentSched.choreId)?.title || 'Assigned Chore'}.`,
        type: 'chore',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    db.schedules[schedIdx] = { ...currentSched, ...updates };
    saveDB(db);
    return mockResponse(db.schedules[schedIdx]);
  }

  // Gallery Photo & Albums API
  if (pathname === '/api/gallery') {
    if (method === 'GET') {
      return mockResponse(db.gallery || []);
    }
    if (method === 'POST') {
      const { photoUrl, title, albumName } = body;
      if (!photoUrl || !title || !albumName) {
        return mockResponse({ error: 'Photo URL, title and album name are required' }, 400);
      }

      const newPhoto = {
        id: `gal-${Date.now()}`,
        userId: userPayload.id,
        albumName,
        photoUrl,
        title,
        uploadedAt: new Date().toISOString(),
      };

      db.gallery.push(newPhoto);

      // Ensure Album exists
      if (!db.albums.some((a) => a.name.toLowerCase() === albumName.toLowerCase() && a.userId === userPayload.id)) {
        db.albums.push({
          id: `alb-${Date.now()}`,
          userId: userPayload.id,
          name: albumName,
          createdAt: new Date().toISOString(),
        });
      }

      // Add general notification
      const u = db.users.find((u) => u.id === userPayload.id);
      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        userId: 'all',
        title: 'New Gallery Upload',
        message: `${u?.name || 'A roommate'} uploaded "${title}" to the gallery in album "${albumName}".`,
        type: 'gallery',
        read: false,
        createdAt: new Date().toISOString(),
      });

      saveDB(db);
      return mockResponse(newPhoto, 201);
    }
  }

  const galleryRegex = /^\/api\/gallery\/([^\/]+)$/;
  const galleryMatch = pathname.match(galleryRegex);
  if (galleryMatch && method === 'DELETE') {
    const photoId = galleryMatch[1];
    db.gallery = db.gallery.filter((p) => p.id !== photoId);
    saveDB(db);
    return mockResponse({ success: true });
  }

  // Albums API
  if (pathname === '/api/albums') {
    if (method === 'GET') {
      return mockResponse(db.albums || []);
    }
    if (method === 'POST') {
      const { name } = body;
      if (!name) return mockResponse({ error: 'Album name is required' }, 400);

      const newAlbum = {
        id: `alb-${Date.now()}`,
        userId: userPayload.id,
        name,
        createdAt: new Date().toISOString(),
      };
      db.albums.push(newAlbum);
      saveDB(db);
      return mockResponse(newAlbum, 201);
    }
  }

  const albumRegex = /^\/api\/albums\/([^\/]+)$/;
  const albumMatch = pathname.match(albumRegex);
  if (albumMatch) {
    const albumId = albumMatch[1];
    const albIdx = db.albums.findIndex((a) => a.id === albumId);

    if (method === 'PUT') {
      if (albIdx !== -1) {
        const oldName = db.albums[albIdx].name;
        const newName = body.name;
        db.albums[albIdx].name = newName;
        // Update photos inside this album
        db.gallery = db.gallery.map((p) => {
          if (p.albumName === oldName) {
            return { ...p, albumName: newName };
          }
          return p;
        });
        saveDB(db);
      }
      return mockResponse({ success: true });
    }
    if (method === 'DELETE') {
      const alb = db.albums.find((a) => a.id === albumId);
      if (alb) {
        db.albums = db.albums.filter((a) => a.id !== albumId);
        db.gallery = db.gallery.filter((p) => p.albumName !== alb.name);
        saveDB(db);
      }
      return mockResponse({ success: true });
    }
  }

  // Announcements API
  if (pathname === '/api/announcements') {
    if (method === 'GET') {
      return mockResponse(db.announcements || []);
    }
    if (method === 'POST') {
      const { title, content } = body;
      if (!title || !content) {
        return mockResponse({ error: 'Title and content are required' }, 400);
      }

      const newAnn = {
        id: `ann-${Date.now()}`,
        title,
        content,
        authorId: userPayload.id,
        createdAt: new Date().toISOString(),
      };

      db.announcements.unshift(newAnn);

      // Notify all members
      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        userId: 'all',
        title: 'New Announcement',
        message: `${title}`,
        type: 'announcement',
        read: false,
        createdAt: new Date().toISOString(),
      });

      saveDB(db);
      return mockResponse(newAnn, 201);
    }
  }

  const annRegex = /^\/api\/announcements\/([^\/]+)$/;
  const annMatch = pathname.match(annRegex);
  if (annMatch && method === 'DELETE') {
    const annId = annMatch[1];
    const ann = db.announcements.find((a) => a.id === annId);
    if (ann) {
      if (!db.history) db.history = [];
      db.history.unshift({
        id: `hist-${Date.now()}`,
        type: 'announcement',
        title: ann.title,
        description: ann.content,
        completedBy: userPayload.email || 'Roommate',
        completedAt: new Date().toISOString(),
        status: 'deleted',
        category: 'Notice',
      });
    }
    db.announcements = db.announcements.filter((a) => a.id !== annId);
    saveDB(db);
    return mockResponse({ success: true });
  }

  // History API
  if (pathname === '/api/history') {
    if (method === 'GET') {
      return mockResponse(db.history || []);
    }
    if (method === 'DELETE') {
      db.history = [];
      saveDB(db);
      return mockResponse({ success: true });
    }
  }

  const histRegex = /^\/api\/history\/([^\/]+)$/;
  const histMatch = pathname.match(histRegex);
  if (histMatch && method === 'DELETE') {
    const histId = histMatch[1];
    if (db.history) {
      db.history = db.history.filter((h) => h.id !== histId);
    }
    saveDB(db);
    return mockResponse({ success: true });
  }

  // Notifications API
  if (pathname === '/api/notifications') {
    if (method === 'GET') {
      const all = db.notifications || [];
      const filtered = all.filter((n) => n.userId === 'all' || n.userId === userPayload.id);
      return mockResponse(filtered);
    }
  }

  if (pathname === '/api/notifications/read' && method === 'POST') {
    db.notifications = db.notifications.map((n) => {
      if (n.userId === 'all' || n.userId === userPayload.id) {
        return { ...n, read: true };
      }
      return n;
    });
    saveDB(db);
    return mockResponse({ success: true });
  }

  // Chat API
  if (pathname === '/api/chats') {
    if (method === 'GET') {
      const messages = db.chatMessages || [];
      const filtered = messages.filter(
        (m) =>
          m.receiverId === 'group' ||
          m.senderId === userPayload.id ||
          m.receiverId === userPayload.id
      );
      return mockResponse(filtered);
    }
    if (method === 'POST') {
      const { message, receiverId, imageUrl, fileUrl, isGroup } = body;
      if (!message && !imageUrl && !fileUrl) {
        return mockResponse({ error: 'Message cannot be empty' }, 400);
      }

      const newMsg = {
        id: `msg-${Date.now()}`,
        senderId: userPayload.id,
        receiverId: receiverId || 'group',
        message: message || '',
        imageUrl,
        fileUrl,
        isGroup: isGroup !== false,
        createdAt: new Date().toISOString(),
      };

      db.chatMessages.push(newMsg);
      saveDB(db);
      return mockResponse(newMsg, 201);
    }
  }

  // Analytics API
  if (pathname === '/api/analytics' && method === 'GET') {
    const users = db.users || [];
    const schedules = db.schedules || [];
    const chores = db.chores || [];

    // Leaderboard
    const leaderboard = [...users]
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .map((u) => ({ id: u.id, name: u.name, points: u.points, avatarUrl: u.avatarUrl }));

    // Task Completion Rate
    const totalSchedules = schedules.length;
    const completedSchedules = schedules.filter((s) => s.status === 'Completed').length;
    const pendingSchedules = schedules.filter((s) => s.status === 'Pending').length;
    const completionRate = totalSchedules > 0 ? Math.round((completedSchedules / totalSchedules) * 100) : 100;

    // Chore completion stats
    const choreStats = chores.map((c) => {
      const choreScheds = schedules.filter((s) => s.choreId === c.id);
      const total = choreScheds.length;
      const done = choreScheds.filter((s) => s.status === 'Completed').length;
      return {
        choreId: c.id,
        title: c.title,
        total,
        completed: done,
        rate: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    return mockResponse({
      leaderboard,
      completionRate,
      completedSchedules,
      pendingSchedules,
      totalSchedules,
      choreStats,
    });
  }

  // Factory Reset
  if (pathname === '/api/admin/reset' && method === 'POST') {
    const currentUserId = userPayload.id;
    const currentUser = db.users.find((u) => u.id === currentUserId);

    db.users = currentUser ? [currentUser] : [];
    db.teams = [];
    db.chores = [];
    db.schedules = [];
    db.gallery = [];
    db.albums = [];
    db.notifications = [
      {
        id: `notif-${Date.now()}`,
        userId: 'all',
        title: 'System Reset Completed',
        message: 'The apartment house data has been completely reset. Welcome to your new clean space!',
        type: 'info',
        read: false,
        createdAt: new Date().toISOString(),
      }
    ];
    db.announcements = [];
    db.chatMessages = [];
    db.history = [];

    saveDB(db);
    return mockResponse({ success: true });
  }

  // Handle remaining API 404s
  return mockResponse({ error: `API route not found: ${method} ${pathname}` }, 404);
};
