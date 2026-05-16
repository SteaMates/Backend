/**
 * Nombre del fichero: lists.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import mongoose from "mongoose";
import GameList from "../models/GameList.js";
import User from "../models/User.js";
import Comment from "../models/Comment.js";
import Notification from "../models/Notification.js";
import { verifyToken } from "../middleware/auth.js";
import { requireCanPublish } from "../middleware/moderationStatus.js";
import {
  validateCommentCreate,
  validateListCreate,
  isObjectId,
} from "../validation/validators.js";

const router = express.Router();

// POST /api/lists - Create a new game list
router.post("/", verifyToken, requireCanPublish, async (req, res) => {
  try {
    const { ok, errors, value } = validateListCreate(req.body);
    if (!ok) {
      return res
        .status(400)
        .json({ error: errors[0].message, details: errors });
    }

    const { title, description, categories, coverImage, games } = value;

    // The user's ID from the session (Passport populates req.user)
    const userId = req.user._id;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const newList = new GameList({
      title,
      description,
      categories: categories || [],
      coverImage: coverImage || "default-list-cover.jpg",
      games,
      author: userId,
    });

    const savedList = await newList.save();

    res.status(201).json(savedList);
  } catch (error) {
    console.error("Error creating list:", error);
    res.status(500).json({ error: "Failed to create game list" });
  }
});

// GET /api/lists - Get all lists (with author populated)
router.get("/", async (req, res) => {
  try {
    const { page, limit } = req.query;

    const hasPagination = page !== undefined || limit !== undefined;
    const pageNumber = Math.max(parseInt(page || "1", 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit || "12", 10) || 12, 1);
    const skip = (pageNumber - 1) * pageSize;

    const query = GameList.find()
      .populate("author", "username avatar steamId")
      .lean()
      .sort({ createdAt: -1, _id: -1 });

    const lists = hasPagination
      ? await query.skip(skip).limit(pageSize)
      : await query;

    // Attach comment counts
    const listsWithComments = await Promise.all(
      lists.map(async (list) => {
        const count = await Comment.countDocuments({ list: list._id });
        return { ...list, commentsCount: count };
      }),
    );

    if (!hasPagination) {
      return res.json(listsWithComments);
    }

    const total = await GameList.countDocuments();

    res.json({
      lists: listsWithComments,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching lists:", error);
    res.status(500).json({ error: "Failed to fetch game lists" });
  }
});

// GET /api/lists/:id - Get a single list
router.get("/:id", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid list id" });
    }

    const list = await GameList.findById(req.params.id).populate(
      "author",
      "username avatar steamId",
    );

    if (!list) {
      return res.status(404).json({ error: "List not found" });
    }

    res.json(list);
  } catch (error) {
    console.error("Error fetching list details:", error);
    res.status(500).json({ error: "Failed to fetch game list" });
  }
});

// DELETE /api/lists/:id - Delete a list
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const listId = req.params.id;
    if (!isObjectId(listId)) {
      return res.status(400).json({ error: "Invalid list id" });
    }
    const userId = req.user._id;

    const list = await GameList.findById(listId);
    if (!list) {
      return res.status(404).json({ error: "List not found" });
    }

    // Check if the user is the author
    if (list.author.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "You are not authorized to delete this list" });
    }

    await GameList.findByIdAndDelete(listId);
    // Optionally delete related comments
    await Comment.deleteMany({ list: listId });

    res.json({ message: "List deleted successfully" });
  } catch (error) {
    console.error("Error deleting list:", error);
    res.status(500).json({ error: "Failed to delete list" });
  }
});

// --- COMMENTS ---

// GET /api/lists/:id/comments
router.get("/:id/comments", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid list id" });
    }

    const { page, limit } = req.query;
    const hasPagination = page !== undefined || limit !== undefined;
    const pageNumber = Math.max(parseInt(page || "1", 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit || "12", 10) || 12, 1);
    const skip = (pageNumber - 1) * pageSize;

    const query = Comment.find({ list: req.params.id })
      .populate("author", "username avatar steamId")
      .sort({ createdAt: -1, _id: -1 });

    const comments = hasPagination
      ? await query.skip(skip).limit(pageSize)
      : await query;

    if (!hasPagination) {
      return res.json(comments);
    }

    const total = await Comment.countDocuments({ list: req.params.id });

    res.json({
      comments,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// POST /api/lists/:id/comments
router.post(
  "/:id/comments",
  verifyToken,
  requireCanPublish,
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        return res.status(400).json({ error: "Invalid list id" });
      }

      const { ok, errors, value } = validateCommentCreate(req.body);
      if (!ok) {
        return res
          .status(400)
          .json({ error: errors[0].message, details: errors });
      }

      const { content, parentId } = value;

      const newComment = new Comment({
        author: req.user._id,
        list: req.params.id,
        content,
        parentComment: parentId || null,
      });
      const saved = await newComment.save();
      await saved.populate("author", "username avatar steamId");

      // --- LÓGICA DE NOTIFICACIONES ---
      const list = await GameList.findById(req.params.id);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // 1. Notificaciones por mención
      const mentionRegex = /@([a-zA-Z0-9_]+)/g;
      let match;
      const mentionedUsernames = new Set();
      while ((match = mentionRegex.exec(content)) !== null) {
        mentionedUsernames.add(match[1]);
      }

      const notifiedUsers = new Set();

      if (mentionedUsernames.size > 0) {
        const mentionedUsers = await User.find({
          username: { $in: Array.from(mentionedUsernames) },
        });

        for (const mentionedUser of mentionedUsers) {
          if (mentionedUser._id.toString() !== req.user._id.toString()) {
            await Notification.create({
              recipient: mentionedUser._id,
              from: req.user._id,
              type: "list_mention",
              title: "Mención en Lista",
              message: `${req.user.username} te ha mencionado en un comentario.`,
              data: { listId: req.params.id, commentId: saved._id },
              expiresAt,
            });
            notifiedUsers.add(mentionedUser._id.toString());
          }
        }
      }

      // 2. Notificación al autor de la lista por nuevo comentario
      if (
        list && 
        list.author.toString() !== req.user._id.toString() && 
        !notifiedUsers.has(list.author.toString())
      ) {
        await Notification.create({
          recipient: list.author,
          from: req.user._id,
          type: "list_comment",
          title: "Nuevo comentario en tu lista",
          message: `${req.user.username} ha comentado en tu lista "${list.title}".`,
          data: { listId: req.params.id, commentId: saved._id },
          expiresAt,
        });
      }
      // ---------------------------------------------


      res.status(201).json(saved);
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

// --- LIKES / DISLIKES ---

router.post("/:id/like", verifyToken, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid list id" });
    }

    const userId = req.user._id;
    const list = await GameList.findById(req.params.id);

    if (!list) return res.status(404).json({ error: "List not found" });

    // Remove from dislikes if present
    list.dislikes = list.dislikes.filter(
      (id) => id.toString() !== userId.toString(),
    );

    // Toggle like
    const liked = list.likes.some((id) => id.toString() === userId.toString());
    if (liked) {
      list.likes = list.likes.filter(
        (id) => id.toString() !== userId.toString(),
      );
    } else {
      list.likes.push(userId);
    }

    await list.save();
    res.json({ likes: list.likes, dislikes: list.dislikes });
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

router.post("/:id/dislike", verifyToken, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid list id" });
    }

    const userId = req.user._id;
    const list = await GameList.findById(req.params.id);

    if (!list) return res.status(404).json({ error: "List not found" });

    // Remove from likes if present
    list.likes = list.likes.filter((id) => id.toString() !== userId.toString());

    // Toggle dislike
    const disliked = list.dislikes.some(
      (id) => id.toString() === userId.toString(),
    );
    if (disliked) {
      list.dislikes = list.dislikes.filter(
        (id) => id.toString() !== userId.toString(),
      );
    } else {
      list.dislikes.push(userId);
    }

    await list.save();
    res.json({ likes: list.likes, dislikes: list.dislikes });
  } catch (error) {
    console.error("Error toggling dislike:", error);
    res.status(500).json({ error: "Failed to toggle dislike" });
  }
});

export default router;
