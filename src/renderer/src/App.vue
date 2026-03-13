<template>
  <el-container class="main_page">
    <Sidebar/>

    <el-container direction="vertical">
      <el-header height="20px">
        <div class="main_title">Title</div>
      </el-header>

      <el-main>
        <el-scrollbar>
          <div>
            <h2>Content</h2>
          </div>
        </el-scrollbar>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
  import Sidebar from './components/Sidebar.vue'
</script>

<style>
  body {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .main_page {
    height: 100vh;
    width: 100vw;
  }
  .main_title {
    border-bottom: 1px solid black;
    display: flex;
    align-items: center;
  }
</style>