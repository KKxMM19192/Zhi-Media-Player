<template>
    <el-aside width="210px" class="sidebar_container">
        <div class="sidebar_title">
            <el-icon :size="25" color="#409EFF"><Headset/></el-icon>
            <span class="sidebar_title_text">Zhi Media Player</span>
        </div>

        <el-menu
            default-active="1"
            class="sidebar_body"
            :border="false">
            <el-menu-item-group title="搜索">
                <el-menu-item>
                    <div>Search Bar(Unfinished)</div>
                </el-menu-item>
            </el-menu-item-group>

            <el-menu-item-group title="推荐">
                <el-menu-item index="1">
                    <el-icon><Compass/></el-icon>
                    <span>发现音乐</span>
                </el-menu-item>

                <el-menu-item index="2">
                    <el-icon><Mic /></el-icon>
                    <span>播客</span>
                </el-menu-item>
            </el-menu-item-group>

            <el-menu-item-group title="我的音乐">
                <el-menu-item index="3">
                    <el-icon><FolderOpened /></el-icon>
                    <span>本地音乐</span>
                </el-menu-item>

                <el-menu-item index="4">
                    <el-icon><Star /></el-icon>
                    <span>我的收藏</span>
                </el-menu-item>

                <el-menu-item index="5">
                    <el-icon><Download /></el-icon>
                    <span>下载管理</span>
                </el-menu-item>
            </el-menu-item-group>
        </el-menu>
    </el-aside>
</template>

<style scoped>
    .sidebar_container {
        background-color: rgba(255, 255, 255, 1);
        display: flex;
        flex-direction: column;
        border-right: 1px solid #e1e4e8;
        height: 100vh;
    }

    .sidebar_title {
        padding: 20px 10px 10px 25px;
        display: flex;
        align-items: center;
        gap: 10px;
        -webkit-app-region: drag;
    }

    .sidebar_title_text {
        font-size: 20px;
        font-weight: bold;
    }

    .sidebar_body {
        background-color: transparent;
    }

    :deep(.el-menu-item) {
        height: 45px;
        line-height: 45px;
        margin: 4px 12px;
        border-radius: 8px;
    }

    :deep(.el-menu-item.is-active) {
        background-color: #409EFF;
        color: #fff;
    }

    :deep(.el-menu-item:hover) {
        background-color: skyblue;
    }
</style>